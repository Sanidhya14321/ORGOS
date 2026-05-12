import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GoalPrioritySchema, GoalStatusSchema } from "@orgos/shared-types";
import { sanitizeGoalInput, SanitizationError } from "@orgos/agent-core";
import { getCsuiteQueue } from "../queue/index.js";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { canAccessTaskWithHierarchy, getHierarchyScope } from "../services/hierarchyScope.js";
import { buildSimulationPreview, recomputeGoalRollup, updateGoalStatus } from "../services/goalEngine.js";

const CreateGoalSchema = z.object({
  title: z.string().min(3).max(200),
  description: z.string().optional(),
  raw_input: z.string().optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  priority: GoalPrioritySchema.default("medium"),
  simulation: z.boolean().default(false)
});

const GoalsListQuerySchema = z.object({
  status: GoalStatusSchema.optional(),
  priority: GoalPrioritySchema.optional(),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20)
});

const PatchGoalSchema = z
  .object({
    status: GoalStatusSchema.optional(),
    priority: GoalPrioritySchema.optional(),
    deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).nullable().optional(),
    description: z.string().nullable().optional()
  })
  .refine((payload) => Object.keys(payload).length > 0, {
    message: "At least one field must be provided"
  });

function isSchemaCacheUnavailable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

const goalsRoutes: FastifyPluginAsync = async (fastify) => {
  async function getRequesterOrgId(userId: string): Promise<string | null> {
    const requester = await fastify.supabaseService
      .from("users")
      .select("org_id")
      .eq("id", userId)
      .maybeSingle();

    return (requester.data?.org_id as string | null | undefined) ?? null;
  }

  fastify.post("/goals", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = CreateGoalSchema.safeParse(request.body);
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path?.[0];
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", issue?.message ?? "Invalid goal payload", {
        field: typeof field === "string" ? field : undefined
      });
    }

    const payload = parsed.data;
    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    let sanitizedRawInput: string;
    try {
      sanitizedRawInput = sanitizeGoalInput(payload.raw_input ?? payload.title);
    } catch (error) {
      if (error instanceof SanitizationError) {
        return sendApiError(reply, request, 400, "VALIDATION_ERROR", error.message, {
          field: "raw_input"
        });
      }
      throw error;
    }

    if (payload.simulation) {
      const previewInput: {
        title: string;
        priority: "low" | "medium" | "high" | "critical";
        description?: string;
        deadline?: string;
      } = {
        title: payload.title,
        priority: payload.priority
      };

      if (payload.description !== undefined) {
        previewInput.description = payload.description;
      }
      if (payload.deadline !== undefined) {
        previewInput.deadline = payload.deadline;
      }

      const preview = buildSimulationPreview(previewInput);
      return reply.status(200).send({ preview });
    }

    const { data, error } = await fastify.supabaseService
      .from("goals")
      .insert({
        org_id: requesterOrgId,
        created_by: requesterId,
        title: payload.title,
        description: payload.description ?? null,
        raw_input: sanitizedRawInput,
        status: "active",
        priority: payload.priority,
        deadline: payload.deadline ?? null,
        simulation: false
      })
      .select("id")
      .single();

    if (error || !data) {
      if (isSchemaCacheUnavailable(error)) {
        return sendApiError(
          reply,
          request,
          503,
          "SERVICE_UNAVAILABLE",
          "Goal tables are not available yet; apply DB migrations first"
        );
      }
      request.log.error({ err: error }, "Failed to insert goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create goal");
    }

    await getCsuiteQueue().add("goal_decompose", { goalId: data.id });

    return reply.status(202).send({ goalId: data.id });
  });

  // Allow any authenticated role to list goals (CEO/CFO/Manager/Worker)
  fastify.get("/goals", { preHandler: requireRole("ceo", "cfo", "manager", "worker") }, async (request, reply) => {
    const parsed = GoalsListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid query params");
    }

    const { status, priority, page, limit } = parsed.data;
    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scope = await getHierarchyScope(fastify, requesterId);
    if (!scope) {
      return reply.send({ page, limit, total: 0, items: [] });
    }

    let query = fastify.supabaseService
      .from("goals")
      .select("id, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at, created_by")
      .eq("org_id", scope.orgId)
      .order("created_at", { ascending: false });

    if (status) {
      query = query.eq("status", status);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }

    const { data, error } = await query;
    if (error) {
      if (isSchemaCacheUnavailable(error)) {
        request.log.warn({ err: error }, "goals table missing in schema cache; returning empty list");
        return reply.send({ page, limit, total: 0, items: [] });
      }
      request.log.error({ err: error }, "Failed to fetch goals");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch goals");
    }

    const allGoals = data ?? [];
    const goalIds = allGoals.map((goal) => goal.id as string);
    const taskCountByGoal = new Map<string, number>();
    const creatorsByUserId = new Map<string, { name: string; position_id: string | null; position_title: string }>();
    const positionsById = new Map<string, { title: string; level: number }>();
    const accessibleGoalIds = new Set<string>();

    // Fetch unique user and position IDs
    const creatorUserIds = Array.from(
      new Set((data ?? []).map((goal) => goal.created_by).filter((id) => id))
    );
    // Batch fetch creators and positions
    if (creatorUserIds.length > 0) {
      const { data: users, error: usersError } = await fastify.supabaseService
        .from("users")
        .select("id, full_name, position_id")
        .in("id", creatorUserIds);

      if (!usersError && users) {
        for (const user of users) {
          creatorsByUserId.set(user.id as string, {
            name: (user.full_name as string) || "Unknown",
            position_id: (user.position_id as string) ?? null,
            position_title: ""
          });
        }
      }
    }

    const positionIds = Array.from(
      new Set(
        [...creatorsByUserId.values()]
          .map((creator) => creator.position_id)
          .filter((id): id is string => typeof id === "string" && id.length > 0)
      )
    );

    if (positionIds.length > 0) {
      const { data: positions, error: posError } = await fastify.supabaseService
        .from("positions")
        .select("id, title, level")
        .in("id", positionIds);

      if (!posError && positions) {
        for (const pos of positions) {
          positionsById.set(pos.id as string, {
            title: (pos.title as string) || "Unknown",
            level: (pos.level as number) ?? 2
          });
        }
      }
    }

    if (goalIds.length > 0) {
      const { data: taskRows, error: tasksError } = await fastify.supabaseService
        .from("tasks")
        .select("goal_id, org_id, assigned_to, assigned_position_id, owner_id, assignees, watchers")
        .in("goal_id", goalIds);

      if (tasksError) {
        if (isSchemaCacheUnavailable(tasksError)) {
          request.log.warn({ err: tasksError }, "tasks table missing in schema cache; defaulting task counts to zero");
          return reply.send({
            page,
            limit,
            total: 0,
            items: allGoals.map((goal) => ({
              ...goal,
              task_count: 0
            }))
          });
        }
        request.log.error({ err: tasksError }, "Failed to fetch task counts");
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch task counts");
      }

      for (const row of taskRows ?? []) {
        const goalId = row.goal_id as string;
        if (scope.executive || canAccessTaskWithHierarchy(row, scope)) {
          accessibleGoalIds.add(goalId);
          taskCountByGoal.set(goalId, (taskCountByGoal.get(goalId) ?? 0) + 1);
        }
      }
    }

    const visibleGoals = scope.executive
      ? allGoals
      : allGoals.filter((goal) => accessibleGoalIds.has(goal.id as string));
    const total = visibleGoals.length;
    const from = (page - 1) * limit;
    const pagedGoals = visibleGoals.slice(from, from + limit);

    return reply.send({
      page,
      limit,
      total,
      items: pagedGoals.map((goal) => {
        const creator = creatorsByUserId.get(goal.created_by as string);
        const createdByPos = creator?.position_id ? positionsById.get(creator.position_id) : undefined;

        return {
          ...goal,
          task_count: taskCountByGoal.get(goal.id as string) ?? 0,
          created_by_name: creator?.name,
          created_by_position: createdByPos?.title || creator?.position_title
        };
      })
    });
  });

  fastify.get("/goals/:id", async (request, reply) => {
    const ParamsSchema = z.object({ id: z.string().uuid() });
    const params = ParamsSchema.safeParse(request.params);

    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid goal id", { field: "id" });
    }

    const goalId = params.data.id;
    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const scope = await getHierarchyScope(fastify, requesterId);
    if (!scope) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const { data: goal, error } = await fastify.supabaseService
      .from("goals")
      .select("id, created_by, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at")
      .eq("id", goalId)
      .eq("org_id", scope.orgId)
      .maybeSingle();

    if (error) {
      if (isSchemaCacheUnavailable(error)) {
        return sendApiError(
          reply,
          request,
          503,
          "SERVICE_UNAVAILABLE",
          "Goal tables are not available yet; apply DB migrations first"
        );
      }
      request.log.error({ err: error }, "Failed to fetch goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch goal");
    }

    if (!goal) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Goal not found");
    }

    const taskRowsResult = await fastify.supabaseService
      .from("tasks")
      .select("id, goal_id, parent_id, depth, title, description, success_criteria, assigned_to, assigned_role, is_agent_task, status, deadline, created_at, org_id, assigned_position_id, owner_id, assignees, watchers")
      .eq("goal_id", goalId)
      .order("depth", { ascending: true })
      .order("created_at", { ascending: true });

    if (taskRowsResult.error) {
      if (isSchemaCacheUnavailable(taskRowsResult.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Goal/task tables are not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to load goal tasks");
    }

    const visibleTasks = scope.executive
      ? (taskRowsResult.data ?? [])
      : (taskRowsResult.data ?? []).filter((task) => canAccessTaskWithHierarchy(task, scope));

    if (!scope.executive && visibleTasks.length === 0) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Goal is outside your scope");
    }

    const taskIds = new Set(visibleTasks.map((task) => String(task.id)));
    const nodeById = new Map<string, { task: Record<string, unknown>; children: Array<{ task: Record<string, unknown>; children: unknown[] }> }>();
    const roots: Array<{ task: Record<string, unknown>; children: unknown[] }> = [];

    for (const task of visibleTasks) {
      nodeById.set(String(task.id), { task: task as Record<string, unknown>, children: [] });
    }

    for (const task of visibleTasks) {
      const node = nodeById.get(String(task.id));
      if (!node) {
        continue;
      }

      const parentId = (task.parent_id as string | null | undefined) ?? null;
      if (parentId && taskIds.has(parentId)) {
        const parent = nodeById.get(parentId);
        if (parent) {
          parent.children.push(node);
          continue;
        }
      }

      roots.push(node);
    }

    return reply.send({ ...goal, tasks: roots });
  });

  fastify.patch("/goals/:id", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const ParamsSchema = z.object({ id: z.string().uuid() });
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid goal id", { field: "id" });
    }

    const payload = PatchGoalSchema.safeParse(request.body);
    if (!payload.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", payload.error.issues[0]?.message ?? "Invalid patch payload");
    }

    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    const patch = {
      ...payload.data,
      updated_at: new Date().toISOString()
    };

    if (patch.status) {
      if (patch.status === "completed") {
        const rollup = await recomputeGoalRollup(fastify.supabaseService, params.data.id);
        if (rollup.status !== "completed") {
          return sendApiError(
            reply,
            request,
            400,
            "VALIDATION_ERROR",
            "A goal can only be completed when every task and subtask is completed"
          );
        }
      }
      await updateGoalStatus(fastify.supabaseService, params.data.id, patch.status);
    }

    const { data, error } = await fastify.supabaseService
      .from("goals")
      .update(patch)
      .eq("id", params.data.id)
      .eq("org_id", requesterOrgId)
      .select("id, created_by, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at")
      .single();

    if (error) {
      if (isSchemaCacheUnavailable(error)) {
        return sendApiError(
          reply,
          request,
          503,
          "SERVICE_UNAVAILABLE",
          "Goal tables are not available yet; apply DB migrations first"
        );
      }
      request.log.error({ err: error }, "Failed to update goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update goal");
    }

    return reply.send(data);
  });

  fastify.delete("/goals/:id", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const ParamsSchema = z.object({ id: z.string().uuid() });
    const params = ParamsSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid goal id", { field: "id" });
    }

    const goalId = params.data.id;
    const requesterId = request.user?.id;
    if (!requesterId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const requesterOrgId = await getRequesterOrgId(requesterId);
    if (!requesterOrgId) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Requester is not assigned to an organization");
    }

    // First verify the goal exists
    const { data: goal, error: fetchError } = await fastify.supabaseService
      .from("goals")
      .select("id")
      .eq("id", goalId)
      .eq("org_id", requesterOrgId)
      .maybeSingle();

    if (fetchError) {
      if (isSchemaCacheUnavailable(fetchError)) {
        return sendApiError(
          reply,
          request,
          503,
          "SERVICE_UNAVAILABLE",
          "Goal tables are not available yet; apply DB migrations first"
        );
      }
      request.log.error({ err: fetchError }, "Failed to fetch goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch goal");
    }

    if (!goal) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Goal not found");
    }

    // Delete the goal
    const { error: deleteError } = await fastify.supabaseService
      .from("goals")
      .delete()
      .eq("id", goalId)
      .eq("org_id", requesterOrgId);

    if (deleteError) {
      if (isSchemaCacheUnavailable(deleteError)) {
        return sendApiError(
          reply,
          request,
          503,
          "SERVICE_UNAVAILABLE",
          "Goal tables are not available yet; apply DB migrations first"
        );
      }
      request.log.error({ err: deleteError }, "Failed to delete goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to delete goal");
    }

    return reply.status(204).send();
  });
};

export default goalsRoutes;
