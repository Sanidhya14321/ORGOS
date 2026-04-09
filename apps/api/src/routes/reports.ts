import crypto from "node:crypto";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { ReportSchema, type Report } from "@orgos/shared-types";
import { sendApiError } from "../lib/errors.js";
import { requireRole } from "../plugins/rbac.js";
import { getSynthesizeQueue } from "../queue/index.js";
import { emitTaskReportSubmittedCascade } from "../services/notifier.js";

const ReportCreateSchema = ReportSchema.omit({ id: true }).extend({
  id: z.string().uuid().optional(),
  submitted_by: z.string().uuid().optional()
});

const TaskIdParamSchema = z.object({ taskId: z.string().uuid() });

async function canSubmitReport(
  fastify: Parameters<FastifyPluginAsync>[0],
  taskId: string,
  userId: string,
  userRole: string | null
): Promise<boolean> {
  const { data: task } = await fastify.supabaseService
    .from("tasks")
    .select("id, assigned_to")
    .eq("id", taskId)
    .maybeSingle();

  if (!task) {
    return false;
  }

  if (task.assigned_to === userId) {
    return true;
  }

  if (userRole !== "manager") {
    return false;
  }

  const { data: manager } = await fastify.supabaseService
    .from("users")
    .select("department")
    .eq("id", userId)
    .maybeSingle();

  if (!manager?.department) {
    return false;
  }

  const { data: assignee } = await fastify.supabaseService
    .from("users")
    .select("department")
    .eq("id", task.assigned_to)
    .maybeSingle();

  return assignee?.department === manager.department;
}

async function collectSubtreeTaskIds(
  fastify: Parameters<FastifyPluginAsync>[0],
  rootTaskId: string
): Promise<string[]> {
  const { data: allTasks, error } = await fastify.supabaseService
    .from("tasks")
    .select("id, parent_id");

  if (error) {
    throw new Error(error.message);
  }

  const byParent = new Map<string, string[]>();
  for (const task of allTasks ?? []) {
    const parentId = (task.parent_id as string | null) ?? "ROOT";
    const list = byParent.get(parentId) ?? [];
    list.push(task.id as string);
    byParent.set(parentId, list);
  }

  const output: string[] = [];
  const stack: string[] = [rootTaskId];

  while (stack.length > 0) {
    const current = stack.pop() as string;
    output.push(current);
    const children = byParent.get(current) ?? [];
    for (const childId of children) {
      stack.push(childId);
    }
  }

  return output;
}

async function enqueueIfSiblingsDone(
  fastify: Parameters<FastifyPluginAsync>[0],
  taskId: string
): Promise<void> {
  const { data: task } = await fastify.supabaseService
    .from("tasks")
    .select("id, parent_id")
    .eq("id", taskId)
    .maybeSingle();

  if (!task?.parent_id) {
    return;
  }

  const { data: siblings } = await fastify.supabaseService
    .from("tasks")
    .select("status")
    .eq("parent_id", task.parent_id);

  const allDone = (siblings ?? []).every((sibling) => sibling.status === "completed");
  if (allDone) {
    await getSynthesizeQueue().add("report_synthesize", { parentTaskId: task.parent_id as string });
  }
}

const reportsRoutes: FastifyPluginAsync = async (fastify) => {
  fastify.post("/reports", async (request, reply) => {
    const parsed = ReportCreateSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid report payload", {
        details: parsed.error.flatten()
      });
    }

    const userId = request.user?.id;
    if (!userId) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    const payload = parsed.data;

    const allowed = await canSubmitReport(fastify, payload.task_id, userId, request.userRole);
    if (!allowed) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Not allowed to submit report for this task");
    }

    const reportId = payload.id ?? crypto.randomUUID();

    const reportToInsert: Report = {
      id: reportId,
      task_id: payload.task_id,
      submitted_by: userId,
      is_agent: payload.is_agent,
      status: payload.status,
      insight: payload.insight,
      data: payload.data,
      confidence: payload.confidence,
      sources: payload.sources,
      escalate: payload.escalate
    };

    const { error: insertError } = await fastify.supabaseService.from("reports").insert(reportToInsert);
    if (insertError) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to insert report");
    }

    const { error: updateTaskError } = await fastify.supabaseService
      .from("tasks")
      .update({ status: "completed", report_id: reportId, updated_at: new Date().toISOString() })
      .eq("id", payload.task_id);

    if (updateTaskError) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to update task status");
    }

    await fastify.supabaseService
      .from("users")
      .update({ open_task_count: 0 })
      .eq("id", userId)
      .gt("open_task_count", 0);

    await enqueueIfSiblingsDone(fastify, payload.task_id);

    await emitTaskReportSubmittedCascade(payload.task_id, {
      reportId,
      isAgent: payload.is_agent,
      confidence: payload.confidence,
      escalate: payload.escalate
    });

    return reply.status(201).send({ reportId });
  });

  fastify.get("/reports/:taskId", async (request, reply) => {
    const params = TaskIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "taskId" });
    }

    const subtreeIds = await collectSubtreeTaskIds(fastify, params.data.taskId);

    const { data: reports, error } = await fastify.supabaseService
      .from("reports")
      .select("id, task_id, is_agent, status, insight, confidence, escalate, created_at")
      .in("task_id", subtreeIds)
      .order("created_at", { ascending: false });

    if (error) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch reports");
    }

    return reply.send({ items: reports ?? [] });
  });

  fastify.get("/reports/:taskId/summary", { preHandler: requireRole("ceo", "cfo", "manager") }, async (request, reply) => {
    const params = TaskIdParamSchema.safeParse(request.params);
    if (!params.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid task id", { field: "taskId" });
    }

    const taskId = params.data.taskId;

    const { data: task } = await fastify.supabaseService
      .from("tasks")
      .select("id, report_id")
      .eq("id", taskId)
      .maybeSingle();

    if (!task) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    if (task.report_id) {
      const { data: report } = await fastify.supabaseService
        .from("reports")
        .select("*")
        .eq("id", task.report_id)
        .maybeSingle();

      if (report && report.is_agent) {
        return reply.send(report);
      }
    }

    await getSynthesizeQueue().add("on_demand_summary", { parentTaskId: taskId });
    return reply.status(202).send({ status: "generating" });
  });
};

export default reportsRoutes;
