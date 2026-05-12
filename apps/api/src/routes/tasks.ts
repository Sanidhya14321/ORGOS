import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { TaskStatusSchema, type Task } from "@orgos/shared-types";
import type { ApiErrorCode } from "../lib/errors.js";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { assignTask } from "../services/assignmentEngine.js";
import { emitTaskAssigned, emitTaskStatusChanged, emitToUser } from "../services/notifier.js";
import { getManagerQueue } from "../queue/index.js";
import { persistRoutingOutcome } from "../services/routingMemory.js";

const ListQuerySchema = z.object({
  status: TaskStatusSchema.optional(),
  goalId: z.string().uuid().optional(),
  page: z.coerce.number().int().positive().catch(1).default(1),
  limit: z.coerce.number().int().positive().max(100).catch(20).default(20)
});

const IdParamSchema = z.object({ id: z.string().uuid() });

const DelegateBodySchema = z.object({
  assignTo: z.string().uuid().nullable(),
  role: z.enum(["ceo", "cfo", "manager", "worker"]).optional()
});

const StatusPatchSchema = z.object({
  status: TaskStatusSchema
});

const ApproveTaskBodySchema = z.object({
  approved: z.boolean().default(true),
  notes: z.string().trim().max(1000).optional()
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
  deadline: z.string().datetime().optional(),
  ownerId: z.string().uuid().optional(),
  assignees: z.array(z.string().uuid()).max(20).optional(),
  watchers: z.array(z.string().uuid()).max(30).optional(),
  dependsOn: z.array(z.string().uuid()).max(30).optional(),
  recurrenceCron: z.string().trim().max(100).optional(),
  recurrenceEnabled: z.boolean().default(false),
  recurrenceTimezone: z.string().trim().max(60).default("UTC"),
  requiresEvidence: z.boolean().default(false),
  estimatedEffortHours: z.number().positive().max(10000).optional()
});

const CreateAttachmentBodySchema = z.object({
  attachmentType: z.enum(["file", "link", "form"]),
  storagePath: z.string().trim().max(500).optional(),
  externalUrl: z.string().url().optional(),
  title: z.string().trim().max(200).optional(),
  mimeType: z.string().trim().max(120).optional(),
  sizeBytes: z.number().int().nonnegative().optional(),
  metadata: z.record(z.any()).optional()
}).superRefine((payload, ctx) => {
  if (payload.attachmentType === "file" && !payload.storagePath) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "storagePath is required for file attachments", path: ["storagePath"] });
  }
  if ((payload.attachmentType === "link" || payload.attachmentType === "form") && !payload.externalUrl) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "externalUrl is required for link/form attachments", path: ["externalUrl"] });
  }
});

const CreateCommentBodySchema = z.object({
  body: z.string().trim().min(1).max(4000),
  parentCommentId: z.string().uuid().optional(),
  mentions: z.array(z.string().uuid()).max(30).optional()
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
  status: z.enum(["pending", "in_progress"]).default("pending")
});

const roleHierarchyLevel: Record<"ceo" | "cfo" | "manager" | "worker", number> = {
  ceo: 0,
  cfo: 0,
  manager: 1,
  worker: 2
};

function isRoleValue(value: unknown): value is "ceo" | "cfo" | "manager" | "worker" {
  return value === "ceo" || value === "cfo" || value === "manager" || value === "worker";
}

function isMissingSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

const allowedTransitions: Record<string, string[]> = {
  pending: ["active", "in_progress", "blocked", "completed"],
  routing: ["active", "in_progress", "blocked"],
  active: ["in_progress", "blocked", "completed"],
  in_progress: ["blocked", "active", "completed"],
  blocked: ["active", "in_progress"],
  rejected: ["active", "in_progress"]
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
      .select("department, org_id")
      .eq("id", userId)
      .single();

    if (managerError || !manager?.department || !manager?.org_id) {
      return { task: null, reason: "forbidden" as const };
    }

    const { data: assignee } = await fastify.supabaseService
      .from("users")
      .select("department, org_id")
      .eq("id", task.assigned_to)
      .maybeSingle();

    if (assignee?.department === manager.department && assignee?.org_id === manager.org_id) {
      return { task, reason: "ok" as const };
    }

    return { task: null, reason: "forbidden" as const };
  }

  const ownerId = (task.owner_id as string | null | undefined) ?? null;
  const assignees = Array.isArray(task.assignees) ? (task.assignees as string[]) : [];
  const watchers = Array.isArray(task.watchers) ? (task.watchers as string[]) : [];

  if (task.assigned_to !== userId && ownerId !== userId && !assignees.includes(userId) && !watchers.includes(userId)) {
    return { task: null, reason: "forbidden" as const };
  }

  return { task, reason: "ok" as const };
}

const tasksRoutes: FastifyPluginAsync = async (fastify) => {
  async function getRequesterOrgId(userId: string): Promise<string | null> {
    const requester = await fastify.supabaseService
      .from("users")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle();

    return (requester.data?.org_id as string | null | undefined) ?? null;
  }

  async function getUserRoleAndOrg(userId: string): Promise<{ role: "ceo" | "cfo" | "manager" | "worker"; orgId: string | null; reportsTo: string | null } | null> {
    const result = await fastify.supabaseService
      .from("users")
      .select("role, org_id, reports_to")
      .eq("id", userId)
      .maybeSingle();

    const role = result.data?.role;
    if (!isRoleValue(role)) {
      return null;
    }

    return {
      role,
      orgId: (result.data?.org_id as string | null | undefined) ?? null,
      reportsTo: (result.data?.reports_to as string | null | undefined) ?? null
    };
  }

  async function isDescendantInOrg(ancestorId: string, candidateId: string, orgId: string): Promise<boolean> {
    if (ancestorId === candidateId) {
      return false;
    }

    const usersResult = await fastify.supabaseService
      .from("users")
      .select("id, reports_to")
      .eq("org_id", orgId);

    if (usersResult.error) {
      return false;
    }

    const childrenByManager = new Map<string, string[]>();
    for (const row of usersResult.data ?? []) {
      const managerId = (row.reports_to as string | null | undefined) ?? null;
      if (!managerId) {
        continue;
      }
      const list = childrenByManager.get(managerId) ?? [];
      list.push(row.id as string);
      childrenByManager.set(managerId, list);
    }

    const visited = new Set<string>();
    const stack = [...(childrenByManager.get(ancestorId) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      if (current === candidateId) {
        return true;
      }
      const children = childrenByManager.get(current) ?? [];
      for (const child of children) {
        stack.push(child);
      }
    }

    return false;
  }

  async function getDescendantIdsInOrg(ancestorId: string, orgId: string): Promise<string[]> {
    const usersResult = await fastify.supabaseService
      .from("users")
      .select("id, reports_to")
      .eq("org_id", orgId);

    if (usersResult.error) {
      return [];
    }

    const childrenByManager = new Map<string, string[]>();
    for (const row of usersResult.data ?? []) {
      const managerId = (row.reports_to as string | null | undefined) ?? null;
      if (!managerId) {
        continue;
      }
      const list = childrenByManager.get(managerId) ?? [];
      list.push(row.id as string);
      childrenByManager.set(managerId, list);
    }

    const descendants: string[] = [];
    const visited = new Set<string>();
    const stack = [...(childrenByManager.get(ancestorId) ?? [])];
    while (stack.length > 0) {
      const current = stack.pop() as string;
      if (visited.has(current)) {
        continue;
      }
      visited.add(current);
      descendants.push(current);
      const children = childrenByManager.get(current) ?? [];
      for (const child of children) {
        stack.push(child);
      }
    }

    return descendants;
  }

  async function validateDownOnlyAssignment(params: {
    requesterId: string;
    requesterRole: string | null;
    requesterOrgId: string;
    assigneeId: string;
  }): Promise<{ ok: boolean; code?: ApiErrorCode; message?: string; assigneeRole?: "ceo" | "cfo" | "manager" | "worker" }> {
    if (!isRoleValue(params.requesterRole)) {
      return { ok: false, code: "FORBIDDEN", message: "Requester role is not eligible for task assignment" };
    }

    const assignee = await getUserRoleAndOrg(params.assigneeId);
    if (!assignee) {
      return { ok: false, code: "VALIDATION_ERROR", message: "Assignee not found" };
    }

    if (!assignee.orgId || assignee.orgId !== params.requesterOrgId) {
      return { ok: false, code: "FORBIDDEN", message: "Cannot assign tasks outside requester organization" };
    }

    if (roleHierarchyLevel[assignee.role] <= roleHierarchyLevel[params.requesterRole]) {
      return { ok: false, code: "VALIDATION_ERROR", message: "Tasks can only be assigned downward in hierarchy" };
    }

    if (params.requesterRole === "manager") {
      const descendant = await isDescendantInOrg(params.requesterId, params.assigneeId, params.requesterOrgId);
      if (!descendant) {
        return { ok: false, code: "FORBIDDEN", message: "Managers can only assign tasks within their reporting subtree" };
      }
    }

    return { ok: true, assigneeRole: assignee.role };
  }

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

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const payload = parsed.data;
    const targetOrgId = payload.orgId ?? requesterOrgId;
    if (targetOrgId !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot create tasks outside requester organization");
    }

    const { data, error } = await fastify.supabaseService
      .from("tasks")
      .insert({
        org_id: targetOrgId,
        created_by: userId,
        owner_id: payload.ownerId ?? userId,
        goal_id: payload.goalId,
        parent_task_id: payload.parentTaskId,
        parent_id: payload.parentTaskId,
        depth: payload.depth,
        title: payload.title,
        description: payload.description,
        success_criteria: payload.successCriteria,
        priority: payload.priority,
        assigned_role: payload.assignedRole,
        assigned_to: payload.assignees?.[0] ?? null,
        assignees: payload.assignees ?? [],
        watchers: payload.watchers ?? [],
        depends_on: payload.dependsOn ?? [],
        recurrence_cron: payload.recurrenceCron ?? null,
        recurrence_enabled: payload.recurrenceEnabled,
        recurrence_timezone: payload.recurrenceTimezone,
        requires_evidence: payload.requiresEvidence,
        estimated_effort_hours: payload.estimatedEffortHours ?? null,
        is_agent_task: false,
        status: "pending",
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

    return reply.status(202).send(data);
  });

  fastify.post("/tasks/:id/routing-suggest", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = RoutingSuggestionBodySchema.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid routing suggestion payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const scopedTask = await fastify.supabaseService
      .from("tasks")
      .select("id, org_id")
      .eq("id", params.data.id)
      .maybeSingle();

    const taskOrgId = (scopedTask.data?.org_id as string | null | undefined) ?? null;
    if (!taskOrgId || taskOrgId !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot create routing suggestion outside requester organization");
    }

    let suggestions = body.data.suggestions;
    if (!suggestions) {
      await getManagerQueue().add("routing_suggest", {
        mode: "routing_suggest",
        taskId: params.data.id
      });

      return reply.status(202).send({
        taskId: params.data.id,
        status: "routing_in_progress"
      });
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

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const scopedTask = await fastify.supabaseService
      .from("tasks")
      .select("id, org_id")
      .eq("id", params.data.id)
      .maybeSingle();

    const taskOrgId = (scopedTask.data?.org_id as string | null | undefined) ?? null;
    if (!taskOrgId || taskOrgId !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot confirm routing outside requester organization");
    }

    for (const confirmed of body.data.confirmed) {
      const validity = await validateDownOnlyAssignment({
        requesterId,
        requesterRole: request.userRole,
        requesterOrgId,
        assigneeId: confirmed.assigneeId
      });

      if (!validity.ok) {
        return sendApiError(reply, request, validity.code === "FORBIDDEN" ? 403 : 400, validity.code ?? "VALIDATION_ERROR", validity.message ?? "Invalid routing confirmation assignee");
      }
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

    await persistRoutingOutcome(fastify, {
      taskId: params.data.id,
      suggested: body.data.confirmed,
      confirmed: body.data.confirmed,
      outcome: "confirmed"
    });

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
          .select("department, org_id")
          .eq("id", userId)
          .single();

        const { data: deptUsers } = await fastify.supabaseService
          .from("users")
          .select("id")
          .eq("department", manager?.department ?? "")
          .eq("org_id", manager?.org_id ?? "");

        const ids = (deptUsers ?? []).map((u) => u.id as string);
        if (ids.length === 0) {
          return reply.send({ page, limit, total: 0, items: [] });
        }

        query = query.or(`assigned_to.in.(${ids.join(",")}),owner_id.in.(${ids.join(",")})`);
      } else {
        query = query.or(`assigned_to.eq.${userId},owner_id.eq.${userId},assignees.cs.{${userId}},watchers.cs.{${userId}}`);
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

    // Enrich tasks with position and assignee context
    const tasks = data ?? [];
    const positionIds = Array.from(new Set(tasks.map((t) => t.assigned_position_id).filter((id) => id)));
    const assigneeIds = Array.from(new Set(tasks.map((t) => t.assigned_to).filter((id) => id)));

    const positionsById = new Map<string, { title: string; level: number }>();
    const assigneesById = new Map<string, { full_name: string; position_title: string; role: string }>();

    if (positionIds.length > 0) {
      const { data: positions } = await fastify.supabaseService
        .from("positions")
        .select("id, title, level")
        .in("id", positionIds);

      if (positions) {
        for (const pos of positions) {
          positionsById.set(pos.id as string, {
            title: (pos.title as string) || "Unknown",
            level: (pos.level as number) ?? 2
          });
        }
      }
    }

    if (assigneeIds.length > 0) {
      const { data: assignees } = await fastify.supabaseService
        .from("users")
        .select("id, full_name, position_id, role")
        .in("id", assigneeIds);

      if (assignees) {
        for (const assignee of assignees) {
          const posId = assignee.position_id as string;
          const posTitle = positionsById.get(posId)?.title || "Unknown";
          assigneesById.set(assignee.id as string, {
            full_name: (assignee.full_name as string) || "Unknown",
            position_title: posTitle,
            role: (assignee.role as string) || "worker"
          });
        }
      }
    }

    const enrichedItems = tasks.map((task) => {
      const assignedPos = positionsById.get(task.assigned_position_id as string);
      const assignee = assigneesById.get(task.assigned_to as string);

      return {
        ...task,
        assigned_position_title: assignedPos?.title,
        assigned_position_level: assignedPos?.level,
        assigned_to_name: assignee?.full_name,
        assigned_to_position: assignee?.position_title,
        assigned_to_role: assignee?.role
      };
    });

    return reply.send({ page, limit, total: count ?? 0, items: enrichedItems });
  });

  fastify.get("/tasks/workload/capacity", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(userId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const usersResult = await fastify.supabaseService
      .from("users")
      .select("id, full_name, department, role")
      .eq("org_id", requesterOrgId);

    if (usersResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch org users");
    }

    const tasksResult = await fastify.supabaseService
      .from("tasks")
      .select("assigned_to, assignees, status, estimated_effort_hours")
      .eq("org_id", requesterOrgId)
      .in("status", ["pending", "routing", "active", "in_progress", "blocked"]);

    if (tasksResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch workload tasks");
    }

    const loadByUser = new Map<string, { taskCount: number; effortHours: number }>();
    for (const row of tasksResult.data ?? []) {
      const effort = Number(row.estimated_effort_hours ?? 1);
      const uniqueAssignees = new Set<string>();
      if (row.assigned_to) {
        uniqueAssignees.add(row.assigned_to as string);
      }
      if (Array.isArray(row.assignees)) {
        for (const assignee of row.assignees as string[]) {
          uniqueAssignees.add(assignee);
        }
      }

      for (const assigneeId of uniqueAssignees) {
        const current = loadByUser.get(assigneeId) ?? { taskCount: 0, effortHours: 0 };
        current.taskCount += 1;
        current.effortHours += effort;
        loadByUser.set(assigneeId, current);
      }
    }

    const defaultCapacityHours = 40;
    const items = (usersResult.data ?? []).map((user) => {
      const load = loadByUser.get(user.id as string) ?? { taskCount: 0, effortHours: 0 };
      const capacityScore = Number((load.effortHours / defaultCapacityHours).toFixed(2));
      return {
        userId: user.id,
        name: user.full_name,
        department: user.department,
        role: user.role,
        openTasks: load.taskCount,
        effortHours: Number(load.effortHours.toFixed(2)),
        capacityHours: defaultCapacityHours,
        capacityScore,
        heat: capacityScore >= 1 ? "high" : capacityScore >= 0.8 ? "medium" : "low"
      };
    });

    return reply.send({ items });
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
      .select("id, status, assigned_to, assigned_role, requires_evidence, completion_approved, blocked_by_count")
      .eq("id", params.data.id)
      .maybeSingle();

    if (error || !task) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    const role = request.userRole;
    const canUpdate = task.assigned_to === userId || role === "ceo" || role === "cfo";
    if (!canUpdate) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only assignee can update task status");
    }

    const allowed = allowedTransitions[task.status as string] ?? [];
    if (!allowed.includes(body.data.status)) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Illegal status transition", {
        from: task.status,
        to: body.data.status
      });
    }

    let targetStatus = body.data.status;
    let suggestedFixes: string | null = null;
    let completionApproved = task.completion_approved === true;
    let completionApprovedBy: string | null = null;
    let completionApprovedAt: string | null = null;
    let completionNotes: string | null = null;

    if (body.data.status === "completed") {
      if (Number(task.blocked_by_count ?? 0) > 0) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Task is blocked by unresolved dependencies");
      }

      if (task.requires_evidence) {
        const attachmentsResult = await fastify.supabaseService
          .from("task_attachments")
          .select("id", { count: "exact", head: true })
          .eq("task_id", task.id);

        if (attachmentsResult.error) {
          return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to verify task evidence");
        }

        if ((attachmentsResult.count ?? 0) === 0) {
          return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Evidence is required before completing this task");
        }

        if (role === "ceo" || role === "cfo") {
          completionApproved = true;
          completionApprovedBy = userId;
          completionApprovedAt = new Date().toISOString();
          completionNotes = "Auto-approved by executive completion action";
        } else {
          targetStatus = "pending";
          completionApproved = false;
          completionNotes = "Awaiting manager approval after evidence submission";
        }
      }

      const assigneeRoleResult = await fastify.supabaseService
        .from("users")
        .select("role")
        .eq("id", userId)
        .maybeSingle();

      const assigneeRole = assigneeRoleResult.data?.role;
      if (assigneeRole === "manager") {
        targetStatus = "pending";
        suggestedFixes = "Awaiting executive approval for manager-completed task";
        completionApproved = false;
      }
    }

    const { data: updated, error: updateError } = await fastify.supabaseService
      .from("tasks")
      .update({
        status: targetStatus,
        suggested_fixes: suggestedFixes,
        completion_approved: completionApproved,
        completion_approved_by: completionApprovedBy,
        completion_approved_at: completionApprovedAt,
        completion_notes: completionNotes,
        updated_at: new Date().toISOString()
      })
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
      status: targetStatus
    });

    return reply.send(updated);
  });

  fastify.post("/tasks/:id/approve", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = ApproveTaskBodySchema.safeParse(request.body ?? {});

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task approval payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const taskResult = await fastify.supabaseService
      .from("tasks")
      .select("id, org_id, assigned_to, assigned_role, status")
      .eq("id", params.data.id)
      .maybeSingle();

    if (taskResult.error || !taskResult.data?.id) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    if (taskResult.data.org_id !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot approve task outside requester organization");
    }

    if (taskResult.data.assigned_role !== "manager") {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Only manager-level tasks require executive approval");
    }

    if (taskResult.data.status !== "pending" && taskResult.data.status !== "completed") {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Task is not awaiting executive approval");
    }

    const approvedStatus = body.data.approved ? "completed" : "in_progress";
    const updated = await fastify.supabaseService
      .from("tasks")
      .update({
        status: approvedStatus,
        completion_approved: body.data.approved,
        completion_approved_by: requesterId,
        completion_approved_at: new Date().toISOString(),
        completion_notes: body.data.notes ?? null,
        rejection_reason: body.data.approved ? null : (body.data.notes || "Rejected during executive review"),
        suggested_fixes: body.data.approved ? null : (body.data.notes || "Revise task output and resubmit for review"),
        updated_at: new Date().toISOString()
      })
      .eq("id", params.data.id)
      .select("*")
      .single();

    if (updated.error || !updated.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to apply executive task approval decision");
    }

    if (taskResult.data.assigned_to) {
      emitTaskStatusChanged(taskResult.data.assigned_to as string, requesterId, {
        taskId: params.data.id,
        status: approvedStatus
      });
    }

    return reply.send(updated.data);
  });

  fastify.get("/tasks/:id/attachments", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scopedTask = await getTaskWithScope(fastify, params.data.id, userId, request.userRole);
    if (scopedTask.reason !== "ok" || !scopedTask.task) {
      return sendApiError(reply, request, scopedTask.reason === "not_found" ? 404 : 403, scopedTask.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN", scopedTask.reason === "not_found" ? "Task not found" : "Task not accessible");
    }

    const result = await fastify.supabaseService
      .from("task_attachments")
      .select("*")
      .eq("task_id", params.data.id)
      .order("created_at", { ascending: false });

    if (result.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch task attachments");
    }

    return reply.send({ items: result.data ?? [] });
  });

  fastify.post("/tasks/:id/attachments", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = CreateAttachmentBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task attachment payload", {
        details: body.success ? undefined : body.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scopedTask = await getTaskWithScope(fastify, params.data.id, userId, request.userRole);
    if (scopedTask.reason !== "ok" || !scopedTask.task) {
      return sendApiError(reply, request, scopedTask.reason === "not_found" ? 404 : 403, scopedTask.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN", scopedTask.reason === "not_found" ? "Task not found" : "Task not accessible");
    }

    const insertResult = await fastify.supabaseService
      .from("task_attachments")
      .insert({
        task_id: params.data.id,
        uploaded_by: userId,
        attachment_type: body.data.attachmentType,
        storage_path: body.data.storagePath ?? null,
        external_url: body.data.externalUrl ?? null,
        title: body.data.title ?? null,
        mime_type: body.data.mimeType ?? null,
        size_bytes: body.data.sizeBytes ?? null,
        metadata: body.data.metadata ?? {}
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create task attachment");
    }

    return reply.status(201).send(insertResult.data);
  });

  fastify.get("/tasks/:id/comments", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "id" });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scopedTask = await getTaskWithScope(fastify, params.data.id, userId, request.userRole);
    if (scopedTask.reason !== "ok" || !scopedTask.task) {
      return sendApiError(reply, request, scopedTask.reason === "not_found" ? 404 : 403, scopedTask.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN", scopedTask.reason === "not_found" ? "Task not found" : "Task not accessible");
    }

    const commentsResult = await fastify.supabaseService
      .from("task_comments")
      .select("*")
      .eq("task_id", params.data.id)
      .order("created_at", { ascending: true });

    if (commentsResult.error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch task comments");
    }

    return reply.send({ items: commentsResult.data ?? [] });
  });

  fastify.post("/tasks/:id/comments", async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = CreateCommentBodySchema.safeParse(request.body);
    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task comment payload", {
        details: body.success ? undefined : body.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scopedTask = await getTaskWithScope(fastify, params.data.id, userId, request.userRole);
    if (scopedTask.reason !== "ok" || !scopedTask.task) {
      return sendApiError(reply, request, scopedTask.reason === "not_found" ? 404 : 403, scopedTask.reason === "not_found" ? "NOT_FOUND" : "FORBIDDEN", scopedTask.reason === "not_found" ? "Task not found" : "Task not accessible");
    }

    const insertResult = await fastify.supabaseService
      .from("task_comments")
      .insert({
        task_id: params.data.id,
        parent_comment_id: body.data.parentCommentId ?? null,
        author_id: userId,
        body: body.data.body,
        mentions: body.data.mentions ?? []
      })
      .select("*")
      .single();

    if (insertResult.error || !insertResult.data) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create task comment");
    }

    for (const mentionId of body.data.mentions ?? []) {
      emitToUser(mentionId, "task:mentioned", {
        taskId: params.data.id,
        commentId: insertResult.data.id,
        by: userId
      });
    }

    return reply.status(201).send(insertResult.data);
  });

  fastify.post("/tasks/:id/delegate", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = IdParamSchema.safeParse(request.params);
    const body = DelegateBodySchema.safeParse(request.body);

    if (!params.success || !body.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid delegate payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const { data: task, error } = await fastify.supabaseService
      .from("tasks")
      .select("*")
      .eq("id", params.data.id)
      .maybeSingle();

    if (error || !task) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    const taskOrgId = (task.org_id as string | null | undefined) ?? null;
    if (!taskOrgId || taskOrgId !== requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Cannot delegate task outside requester organization");
    }

    if (body.data.assignTo === null) {
      if (!isRoleValue(request.userRole)) {
        return sendApiError(reply, request, 403, "FORBIDDEN", "Requester role is not eligible for task assignment");
      }

      const desiredRole = (body.data.role ?? task.assigned_role) as "ceo" | "cfo" | "manager" | "worker";
      if (roleHierarchyLevel[desiredRole] <= roleHierarchyLevel[request.userRole]) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Tasks can only be assigned downward in hierarchy");
      }

      const eligibleAssigneeIds = request.userRole === "manager"
        ? await getDescendantIdsInOrg(requesterId, requesterOrgId)
        : undefined;

      if (request.userRole === "manager" && (!eligibleAssigneeIds || eligibleAssigneeIds.length === 0)) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", "No eligible direct reports available for assignment");
      }

      const taskForAssignment: Task = {
        id: task.id as string,
        org_id: (task.org_id as string | null) ?? undefined,
        created_by: (task.created_by as string | null) ?? undefined,
        goal_id: task.goal_id as string,
        parent_id: (task.parent_id as string | null) ?? null,
        parent_task_id: (task.parent_task_id as string | null) ?? null,
        depth: Number(task.depth) as 0 | 1 | 2,
        title: String(task.title),
        description: (task.description as string | null) ?? undefined,
        success_criteria: String(task.success_criteria),
        required_skills: (task.required_skills as string[] | null) ?? undefined,
        priority: (task.priority as "low" | "medium" | "high" | "critical" | null) ?? undefined,
        assigned_to: (task.assigned_to as string | null) ?? null,
        assigned_role: (body.data.role ?? task.assigned_role) as "ceo" | "cfo" | "manager" | "worker",
        is_agent_task: Boolean(task.is_agent_task),
        routing_confirmed: (task.routing_confirmed as boolean | null) ?? undefined,
        status: task.status as "pending" | "routing" | "active" | "in_progress" | "blocked" | "rejected" | "completed" | "cancelled",
        deadline: (task.deadline as string | null) ?? undefined,
        sla_deadline: (task.sla_deadline as string | null) ?? undefined,
        sla_status: (task.sla_status as "on_track" | "at_risk" | "breached" | null) ?? undefined,
        rejection_reason: (task.rejection_reason as string | null) ?? undefined,
        suggested_fixes: (task.suggested_fixes as string | null) ?? undefined
      };

      const reassigned = await assignTask({
        ...taskForAssignment,
        ...(eligibleAssigneeIds ? { eligible_assignee_ids: eligibleAssigneeIds } : {})
      } as Task);
      return reply.send(reassigned);
    }

    const assigneeValidity = await validateDownOnlyAssignment({
      requesterId,
      requesterRole: request.userRole,
      requesterOrgId,
      assigneeId: body.data.assignTo
    });

    if (!assigneeValidity.ok || !assigneeValidity.assigneeRole) {
      return sendApiError(
        reply,
        request,
        assigneeValidity.code === "FORBIDDEN" ? 403 : 400,
        assigneeValidity.code ?? "VALIDATION_ERROR",
        assigneeValidity.message ?? "Invalid assignee"
      );
    }

    const { data: updated, error: updateError } = await fastify.supabaseService
      .from("tasks")
      .update({
        assigned_to: body.data.assignTo,
        assigned_role: assigneeValidity.assigneeRole,
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
