import type { FastifyInstance } from "fastify";
import { emitToRole, emitToUser } from "./notifier.js";

type SlaTaskRow = {
  id: string;
  assigned_to: string | null;
  assigned_role: "ceo" | "cfo" | "manager" | "worker";
  sla_deadline: string | null;
  sla_status: "on_track" | "at_risk" | "breached" | null;
  status: string;
};

const ACTIVE_STATUSES = ["pending", "routing", "active", "in_progress", "blocked"];

function isMissingSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

function getNextSlaStatus(
  deadlineIso: string,
  nowMs: number,
  atRiskWindowMs: number
): "on_track" | "at_risk" | "breached" {
  const deadlineMs = Date.parse(deadlineIso);
  if (Number.isNaN(deadlineMs)) {
    return "on_track";
  }

  if (deadlineMs <= nowMs) {
    return "breached";
  }

  if (deadlineMs - nowMs <= atRiskWindowMs) {
    return "at_risk";
  }

  return "on_track";
}

async function persistSlaStatus(
  fastify: FastifyInstance,
  taskId: string,
  nextStatus: "on_track" | "at_risk" | "breached"
): Promise<void> {
  const { error } = await fastify.supabaseService
    .from("tasks")
    .update({ sla_status: nextStatus, updated_at: new Date().toISOString() })
    .eq("id", taskId);

  if (error && !isMissingSchemaCache(error)) {
    throw new Error(`Unable to persist SLA status for task ${taskId}: ${error.message}`);
  }
}

async function appendAuditLog(
  fastify: FastifyInstance,
  taskId: string,
  action: "sla_at_risk" | "sla_breached"
): Promise<void> {
  const { error } = await fastify.supabaseService.from("audit_log").insert({
    org_id: null,
    actor_id: null,
    action,
    entity: "task",
    entity_id: taskId,
    meta: { source: "sla_monitor" }
  });

  if (error && !isMissingSchemaCache(error)) {
    fastify.log.warn({ err: error, taskId, action }, "SLA audit log insert failed");
  }
}

async function evaluateSlaOnce(
  fastify: FastifyInstance,
  atRiskWindowMs: number
): Promise<void> {
  const { data, error } = await fastify.supabaseService
    .from("tasks")
    .select("id, assigned_to, assigned_role, sla_deadline, sla_status, status")
    .in("status", ACTIVE_STATUSES)
    .not("sla_deadline", "is", null);

  if (error) {
    if (isMissingSchemaCache(error)) {
      fastify.log.warn({ err: error }, "Skipping SLA pass; tasks schema not available yet");
      return;
    }
    throw new Error(`Unable to load tasks for SLA check: ${error.message}`);
  }

  const nowMs = Date.now();
  const tasks = (data ?? []) as SlaTaskRow[];

  for (const task of tasks) {
    if (!task.sla_deadline) {
      continue;
    }

    const nextStatus = getNextSlaStatus(task.sla_deadline, nowMs, atRiskWindowMs);
    const currentStatus = task.sla_status ?? "on_track";

    if (nextStatus === currentStatus) {
      continue;
    }

    await persistSlaStatus(fastify, task.id, nextStatus);

    if (nextStatus === "at_risk") {
      if (task.assigned_to) {
        emitToUser(task.assigned_to, "task:sla_at_risk", {
          taskId: task.id,
          status: nextStatus
        });
      }
      await appendAuditLog(fastify, task.id, "sla_at_risk");
    }

    if (nextStatus === "breached") {
      if (task.assigned_to) {
        emitToUser(task.assigned_to, "task:sla_breached", {
          taskId: task.id,
          status: nextStatus
        });
      }
      emitToRole("ceo", "task:sla_breached", { taskId: task.id, status: nextStatus });
      emitToRole("cfo", "task:sla_breached", { taskId: task.id, status: nextStatus });
      await appendAuditLog(fastify, task.id, "sla_breached");
    }
  }
}

export function startSlaMonitor(fastify: FastifyInstance): { stop: () => void } {
  const intervalMs = fastify.env.SLA_CHECK_INTERVAL_MS;
  const atRiskWindowMs = fastify.env.SLA_AT_RISK_WINDOW_MINUTES * 60_000;

  if (!fastify.env.SLA_MONITOR_ENABLED) {
    fastify.log.info("SLA monitor disabled by configuration");
    return {
      stop: () => {
        // no-op
      }
    };
  }

  let timer: NodeJS.Timeout | null = null;
  let running = false;

  const tick = async (): Promise<void> => {
    if (running) {
      return;
    }

    running = true;
    try {
      await evaluateSlaOnce(fastify, atRiskWindowMs);
    } catch (error) {
      fastify.log.error({ err: error }, "SLA monitor tick failed");
    } finally {
      running = false;
    }
  };

  void tick();
  timer = setInterval(() => {
    void tick();
  }, intervalMs);

  fastify.log.info({ intervalMs, atRiskWindowMs }, "SLA monitor started");

  return {
    stop: () => {
      if (timer) {
        clearInterval(timer);
        timer = null;
      }
      fastify.log.info("SLA monitor stopped");
    }
  };
}
