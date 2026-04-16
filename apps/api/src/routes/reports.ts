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

function isSchemaCacheUnavailable(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

async function canSubmitReport(
  fastify: Parameters<FastifyPluginAsync>[0],
  taskId: string,
  userId: string,
  userRole: string | null
): Promise<boolean | "unavailable"> {
  const { data: task, error: taskError } = await fastify.supabaseService
    .from("tasks")
    .select("id, assigned_to")
    .eq("id", taskId)
    .maybeSingle();

  if (taskError) {
    if (isSchemaCacheUnavailable(taskError)) {
      return "unavailable";
    }
    return false;
  }

  if (!task) {
    return false;
  }

  if (task.assigned_to === userId) {
    return true;
  }

  if (userRole !== "manager") {
    return false;
  }

  const { data: manager, error: managerError } = await fastify.supabaseService
    .from("users")
    .select("department")
    .eq("id", userId)
    .maybeSingle();

  if (managerError) {
    if (isSchemaCacheUnavailable(managerError)) {
      return "unavailable";
    }
    return false;
  }

  if (!manager?.department) {
    return false;
  }

  const { data: assignee, error: assigneeError } = await fastify.supabaseService
    .from("users")
    .select("department")
    .eq("id", task.assigned_to)
    .maybeSingle();

  if (assigneeError) {
    if (isSchemaCacheUnavailable(assigneeError)) {
      return "unavailable";
    }
    return false;
  }

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
    if (isSchemaCacheUnavailable(error)) {
      return [rootTaskId];
    }
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
    if (allowed === "unavailable") {
      return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task/report tables are not available yet; apply DB migrations first");
    }
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
      if (isSchemaCacheUnavailable(insertError)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task/report tables are not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to insert report");
    }

    const { error: updateTaskError } = await fastify.supabaseService
      .from("tasks")
      .update({ status: "completed", report_id: reportId, updated_at: new Date().toISOString() })
      .eq("id", payload.task_id);

    if (updateTaskError) {
      if (isSchemaCacheUnavailable(updateTaskError)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task/report tables are not available yet; apply DB migrations first");
      }
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

    let subtreeIds: string[];
    try {
      subtreeIds = await collectSubtreeTaskIds(fastify, params.data.taskId);
    } catch {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch reports");
    }

    const { data: reports, error } = await fastify.supabaseService
      .from("reports")
      .select("id, task_id, is_agent, status, insight, confidence, escalate, created_at")
      .in("task_id", subtreeIds)
      .order("created_at", { ascending: false });

    if (error) {
      if (isSchemaCacheUnavailable(error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Report tables are not available yet; apply DB migrations first");
      }
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

    const taskResult = await fastify.supabaseService
      .from("tasks")
      .select("id, report_id")
      .eq("id", taskId)
      .maybeSingle();

    if (taskResult.error) {
      if (isSchemaCacheUnavailable(taskResult.error)) {
        return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task/report tables are not available yet; apply DB migrations first");
      }
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch task for summary");
    }

    const taskData = taskResult.data;

    if (!taskData) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Task not found");
    }

    if (taskData.report_id) {
      const { data: report, error: reportError } = await fastify.supabaseService
        .from("reports")
        .select("*")
        .eq("id", taskData.report_id)
        .maybeSingle();

      if (reportError) {
        if (isSchemaCacheUnavailable(reportError)) {
          return sendApiError(reply, request, 503, "SERVICE_UNAVAILABLE", "Task/report tables are not available yet; apply DB migrations first");
        }
        return sendApiError(reply, request, 500, "INTERNAL_ERROR", "Failed to fetch report summary");
      }

      if (report && report.is_agent) {
        return reply.send(report);
      }
    }

    await getSynthesizeQueue().add("on_demand_summary", { parentTaskId: taskId });
    return reply.status(202).send({ status: "generating" });
  });
};

export default reportsRoutes;
