import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { GoalPrioritySchema, GoalStatusSchema } from "@orgos/shared-types";
import { sanitizeGoalInput, SanitizationError } from "@orgos/agent-core";
import { decomposeQueue } from "../queue/index.js";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { buildSimulationPreview, buildTaskTree, updateGoalStatus } from "../services/goalEngine.js";

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
      request.log.error({ err: error }, "Failed to insert goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to create goal");
    }

    await decomposeQueue.add("goal_decompose", { goalId: data.id });

    return reply.status(202).send({ goalId: data.id });
  });

  fastify.get("/goals", { preHandler: requireRole("ceo", "cfo") }, async (request, reply) => {
    const parsed = GoalsListQuerySchema.safeParse(request.query);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid query params");
    }

    const { status, priority, page, limit } = parsed.data;
    const from = (page - 1) * limit;
    const to = from + limit - 1;

    let query = fastify.supabaseService
      .from("goals")
      .select("id, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at", {
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
      request.log.error({ err: error }, "Failed to fetch goals");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch goals");
    }

    const goalIds = (data ?? []).map((goal) => goal.id as string);
    const taskCountByGoal = new Map<string, number>();

    if (goalIds.length > 0) {
      const { data: taskRows, error: tasksError } = await fastify.supabaseService
        .from("tasks")
        .select("goal_id")
        .in("goal_id", goalIds);

      if (tasksError) {
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
      items: (data ?? []).map((goal) => ({
        ...goal,
        task_count: taskCountByGoal.get(goal.id as string) ?? 0
      }))
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
      await updateGoalStatus(fastify.supabaseService, params.data.id, patch.status);
    }

    const { data, error } = await fastify.supabaseService
      .from("goals")
      .update(patch)
      .eq("id", params.data.id)
      .select("id, created_by, title, description, raw_input, status, priority, kpi, deadline, simulation, created_at, updated_at")
      .single();

    if (error) {
      request.log.error({ err: error }, "Failed to update goal");
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update goal");
    }

    return reply.send(data);
  });
};

export default goalsRoutes;
