import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { TaskStatusSchema, type Task } from "@orgos/shared-types";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { assignTask } from "../services/assignmentEngine.js";
import { emitTaskAssigned, emitTaskStatusChanged, emitToUser } from "../services/notifier.js";
import { suggestRoutingForTask } from "../services/agentService.js";

const ListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  goalId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const IdParamSchema = z.object({ id: z.string().uuid() });

const DelegateBodySchema = z.object({
  assignTo: z.string().uuid().nullable(),
  role: z.enum(["ceo", "cfo", "manager", "worker"]).optional()
});

const StatusPatchSchema = z.object({
  status: TaskStatusSchema
});

const CreateTaskBodySchema = z.object({
  orgId: z.string().uuid().optional(),
  goalId: z.string().uuid(),
  parentTaskId: z.string().uuid().optional(),
  title: z.string().trim().min(1).max(200),
  description: z.string().trim().max(2000).optional(),
  successCriteria: z.string().trim().min(1).max(2000),
  requiredSkills: z.array(z.string().trim().min(1)).max(30).optional(),
  priority: z.enum(["low", "medium", "high", "critical"]).default("medium"),
  assignedRole: z.enum(["ceo", "cfo", "manager", "worker"]),
  depth: z.union([z.literal(0), z.literal(1), z.literal(2)]).default(0),
  deadline: z.string().datetime().optional()
});

const RoutingSuggestionBodySchema = z.object({
  suggestions: z.array(z.object({
    assigneeId: z.string().uuid(),
    reason: z.string().trim().min(1).max(400),
    confidence: z.number().min(0).max(1)
  })).min(1).max(20)
}).partial();

const ConfirmRoutingBodySchema = z.object({
  confirmed: z.array(z.object({
    assigneeId: z.string().uuid(),
    reason: z.string().trim().min(1).max(400),
    confidence: z.number().min(0).max(1)
  })).min(1).max(20),
  status: z.enum(["pending", "active"]).default("active")
});

function isMissingSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

const allowedTransitions: Record<string, string[]> = {
  pending: ["in_progress"],
  in_progress: ["blocked", "completed"]
};

async function getTaskWithScope(fastify: Parameters<FastifyPluginAsync>[0], taskId: string, userId: string, userRole: string | null) {
  const baseTaskQuery = fastify.supabaseService
    .from("tasks")
    .select("*")
    .eq("id", taskId)
    .maybeSingle();

  const { data: task, error } = await baseTaskQuery;
  if (error || !task) {
    return { task: null, reason: "not_found" as const };
  }

  if (userRole === "ceo" || userRole === "cfo") {
    return { task, reason: "ok" as const };
  }

  if (userRole === "manager") {
    const { data: manager, error: managerError } = await fastify.supabaseService
      .from("users")
      .select("department")
      .eq("id", userId)
      .single();

    if (managerError || !manager?.department) {
      return { task: null, reason: "forbidden" as const };
    }

    const { data: assignee } = await fastify.supabaseService
      .from("users")
      .select("department")
      .eq("id", task.assigned_to)
      .maybeSingle();

    if (assignee?.department === manager.department) {
      return { task, reason: "ok" as const };
    }

    return { task: null, reason: "forbidden" as const };
  }

  if (task.assigned_to !== userId) {
    return { task: null, reason: "forbidden" as const };
  }

  return { task, reason: "ok" as const };
}

const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/tasks", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const parsed = CreateTaskBodySchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid create task payload", {
        details: parsed.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const payload = parsed.data;
    const { data, error } = await fastify.supabaseService
      .from("tasks")
      .insert({
        org_id: payload.orgId,
        created_by: userId,
        goal_id: payload.goalId,
        parent_task_id: payload.parentTaskId,
        parent_id: payload.parentTaskId,
        depth: payload.depth,
        title: payload.title,
        description: payload.description,
        success_criteria: payload.successCriteria,
        required_skills: payload.requiredSkills,
        priority: payload.priority,
        assigned_role: payload.assignedRole,
        is_agent_task: false,
        status: "routing",
        routing_confirmed: false,
        deadline: payload.deadline,
        sla_deadline: payload.deadline
      })
      .select("*")
      .single();

    if (error || !data) {
      if (isMissingSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task schema not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create task");
    }

    return reply.status(201).send(data);
  });

  fastify.post("/tasks/:id/routing-suggest", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = RoutingSuggestionBodySchema.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid routing suggestion payload");
    }

    let suggestions = body.data.suggestions;
    if (!suggestions) {
      try {
        const generated = await suggestRoutingForTask(fastify, params.data.id);
        suggestions = generated.suggestions;
      } catch (error) {
        request.log.error({ err: error, taskId: params.data.id }, "Failed to generate routing suggestion");
        return sendApiError(reply, request, 502, "INTERNAL_ERROR", "Failed to generate routing suggestion");
      }
    }

    if (!suggestions || suggestions.length === 0) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "No eligible assignees available for routing suggestion");
    }

    const { error } = await fastify.supabaseService
      .from("routing_suggestions")
      .insert({
        task_id: params.data.id,
        suggested: suggestions,
        confirmed: null,
        outcome: null
      });

    if (error) {
      if (isMissingSchemaCache(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Routing suggestions table not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to store routing suggestion");
    }

    const { data: taskOwner } = await fastify.supabaseService
      .from("tasks")
      .select("created_by")
      .eq("id", params.data.id)
      .maybeSingle();

    if (taskOwner?.created_by) {
      emitToUser(taskOwner.created_by as string, "task:routing_ready", {
        taskId: params.data.id,
        suggestions
      });
    }

    return reply.status(200).send({ suggestions });
  });

  fastify.post("/tasks/:id/routing-confirm", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = ConfirmRoutingBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid routing confirmation payload");
    }

    const updateTask = await fastify.supabaseService
      .from("tasks")
      .update({
        routing_confirmed: true,
        status: body.data.status,
        updated_at: new Date().toISOString()
      })
      .eq("id", params.data.id)
      .select("*")
      .maybeSingle();

    if (updateTask.error || !updateTask.data) {
      if (isMissingSchemaCache(updateTask.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task schema not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to confirm routing");
    }

    const upsertSuggestion = await fastify.supabaseService
      .from("routing_suggestions")
      .insert({
        task_id: params.data.id,
        suggested: body.data.confirmed,
        confirmed: body.data.confirmed,
        outcome: "confirmed"
      });

    if (upsertSuggestion.error) {
      request.log.warn({ err: upsertSuggestion.error }, "Unable to persist routing confirmation audit");
    }

    for (const suggestion of body.data.confirmed) {
      emitToUser(suggestion.assigneeId, "task:routing_confirmed", {
        taskId: params.data.id,
        confidence: suggestion.confidence
      });
    }

    return reply.send(updateTask.data);
  });

  fastify.get("/tasks", async (request, reply) => {
    const parsed = ListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task query");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { status, goalId, page, limit } = parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = fastify.supabaseService.from("tasks").select("*", { count: "exact" }).range(from, to);

    if (status) {
      query = query.eq("status", status);
    }
    if (goalId) {
      query = query.eq("goal_id", goalId);
    }

    if (request.userRole !== "ceo" && request.userRole !== "cfo") {
      if (request.userRole === "manager") {
        const { data: manager } = await fastify.supabaseService
          .from("users")
          .select("department")
          .eq("id", userId)
          .single();

        const { data: deptUsers } = await fastify.supabaseService
          .from("users")
          .select("id")
          .eq("department", manager?.department ?? "");

        const ids = (deptUsers ?? []).map((u) => u.id as string);
        if (ids.length === 0) {
          return reply.send({ page, limit, total: 0, items: [] });
        }

        query = query.in("assigned_to", ids);
      } else {
        query = query.eq("assigned_to", userId);
      }
    }

    const { data, error, count } = await query;
    if (error) {
      const missingTasksTable = error.code === "PGRST205" && error.message.includes("public.tasks");
      if (missingTasksTable) {
        request.log.warn({ err: error }, "Tasks table is unavailable in Supabase schema cache; returning empty task list");
        return reply.send({ page, limit, total: 0, items: [] });
      }

      request.log.error({ err: error, userId, status, goalId, page, limit }, "Failed to fetch tasks");

      if (isMissingSchemaCache(error)) {
        request.log.warn({ err: error }, "tasks table missing in schema cache; returning empty task list");
        return reply.send({ page, limit, total: 0, items: [] });
      }

      const details = fastify.env.NODE_ENV === "production"
        ? undefined
        : {
            code: error.code,
            message: error.message,
            details: error.details,
            hint: error.hint
          };

      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch tasks", details ? { details } : undefined);
    }

    return reply.send({ page, limit, total: count ?? 0, items: data ?? [] });
  });

  fastify.get("/tasks/:id", async (request, reply) => {
    const parsed = IdParamSchema.safeParse(request.params);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scopedTask = await getTaskWithScope(fastify, parsed.data.id, userId, request.userRole);
    if (scopedTask.reason === "not_found") {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }
    if (scopedTask.reason === "forbidden" || !scopedTask.task) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Task not accessible");
    }

    const task = scopedTask.task;

    const { data: goal } = await fastify.supabaseService
      .from("goals")
      .select("id, title, status, priority, deadline")
      .eq("id", task.goal_id)
      .maybeSingle();

    const parent = task.parent_id
      ? (await fastify.supabaseService
          .from("tasks")
          .select("id, title, status, assigned_to")
          .eq("id", task.parent_id)
          .maybeSingle()).data
      : null;

    return reply.send({ goal, parent, task });
  });

  fastify.patch("/tasks/:id", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = StatusPatchSchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task patch payload");
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const { data: task, error } = await fastify.supabaseService
      .from("tasks")
      .select("id, status, assigned_to")
      .eq("id", params.data.id)
      .maybeSingle();

    if (error || !task) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    if (task.assigned_to !== userId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only assignee can update task status");
    }

    const allowed = allowedTransitions[task.status as string] ?? [];
    if (!allowed.includes(body.data.status)) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Illegal status transition", {
        from: task.status,
        to: body.data.status
      });
    }

    const { data: updated, error: updateError } = await fastify.supabaseService
      .from("tasks")
      .update({ status: body.data.status, updated_at: new Date().toISOString() })
      .eq("id", task.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update task status");
    }

    let managerId: string | null = null;
    if (task.assigned_to) {
      const managerLookup = await fastify.supabaseService
        .from("users")
        .select("reports_to")
        .eq("id", task.assigned_to)
        .maybeSingle();

      managerId = (managerLookup.data?.reports_to as string | null) ?? null;
    }

    emitTaskStatusChanged(task.assigned_to as string, managerId, {
      taskId: task.id,
      status: body.data.status
    });

    return reply.send(updated);
  });

  fastify.post("/tasks/:id/delegate", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = DelegateBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid delegate payload");
    }

    const { data: task, error } = await fastify.supabaseService
      .from("tasks")
      .select("*")
      .eq("id", params.data.id)
      .maybeSingle();

    if (error || !task) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    if (body.data.assignTo === null) {
      const taskForAssignment: Task = {
        id: task.id as string,
        goal_id: task.goal_id as string,
        parent_id: (task.parent_id as string | null) ?? null,
        depth: Number(task.depth) as 0 | 1 | 2,
        title: String(task.title),
        description: (task.description as string | null) ?? undefined,
        success_criteria: String(task.success_criteria),
        required_skills: (task.required_skills as string[] | null) ?? undefined,
        assigned_to: (task.assigned_to as string | null) ?? null,
        assigned_role: (body.data.role ?? task.assigned_role) as "ceo" | "cfo" | "manager" | "worker",
        is_agent_task: Boolean(task.is_agent_task),
        status: task.status as "pending" | "in_progress" | "blocked" | "completed" | "cancelled",
        deadline: (task.deadline as string | null) ?? undefined
      };

      const reassigned = await assignTask(taskForAssignment);
      return reply.send(reassigned);
    }

    const { data: updated, error: updateError } = await fastify.supabaseService
      .from("tasks")
      .update({
        assigned_to: body.data.assignTo,
        assigned_role: body.data.role ?? task.assigned_role,
        is_agent_task: false,
        updated_at: new Date().toISOString()
      })
      .eq("id", params.data.id)
      .select("*")
      .single();

    if (updateError || !updated) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to delegate task");
    }

    if (updated.assigned_to) {
      emitTaskAssigned(updated.assigned_to as string, {
        taskId: updated.id,
        role: updated.assigned_role,
        isAgentTask: updated.is_agent_task
      });
    }

    return reply.send(updated);
  });
};

export default tasksRoutes;
