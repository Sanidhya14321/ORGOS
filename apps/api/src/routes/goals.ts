import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GoalPrioritySchema, GoalStatusSchema } from "@orgos/shared-types";
import { sanitizeGoalInput, SanitizationError } from "@orgos/agent-core";
import { getCsuiteQueue } from "../queue/index.js";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { buildSimulationPreview, buildTaskTree, recomputeGoalRollup, updateGoalStatus } from "../services/goalEngine.js";

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
        created_by: request.user?.id,
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
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = fastify.supabaseService
      .from("goals")
      .select("id, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at, created_by", {
        count: "exact"
      })
      .order("created_at", { ascending: false })
      .range(from, to);

    if (status) {
      query = query.eq("status", status);
    }
    if (priority) {
      query = query.eq("priority", priority);
    }

    const { data, count, error } = await query;
    if (error) {
      if (isSchemaCacheUnavailable(error)) {
        request.log.warn({ err: error }, "goals table missing in schema cache; returning empty list");
        return reply.send({ page, limit, total: 0, items: [] });
      }
      request.log.error({ err: error }, "Failed to fetch goals");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch goals");
    }

    const goalIds = (data ?? []).map((goal) => goal.id as string);
    const taskCountByGoal = new Map<string, number>();
    const creatorsByUserId = new Map<string, { name: string; position_id: string | null; position_title: string }>();
    const positionsById = new Map<string, { title: string; level: number }>();

    // Fetch unique user and position IDs
    const creatorUserIds = Array.from(
      new Set((data ?? []).map((goal) => goal.created_by).filter((id) => id))
    );
    const positionIds = Array.from(
      new Set(
        (data ?? [])
          .map((goal) => goal.created_by)
          .filter((id) => id)
      )
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
        .select("goal_id")
        .in("goal_id", goalIds);

      if (tasksError) {
        if (isSchemaCacheUnavailable(tasksError)) {
          request.log.warn({ err: tasksError }, "tasks table missing in schema cache; defaulting task counts to zero");
          return reply.send({
            page,
            limit,
            total: count ?? 0,
            items: (data ?? []).map((goal) => ({
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
        taskCountByGoal.set(goalId, (taskCountByGoal.get(goalId) ?? 0) + 1);
      }
    }

    return reply.send({
      page,
      limit,
      total: count ?? 0,
      items: (data ?? []).map((goal) => {
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

    const { data: goal, error } = await fastify.supabaseService
      .from("goals")
      .select("id, created_by, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at")
      .eq("id", goalId)
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

    const tasks = await buildTaskTree(fastify.supabaseService, goalId);
    return reply.send({ ...goal, tasks });
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

    // First verify the goal exists
    const { data: goal, error: fetchError } = await fastify.supabaseService
      .from("goals")
      .select("id")
      .eq("id", goalId)
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
      .eq("id", goalId);

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
