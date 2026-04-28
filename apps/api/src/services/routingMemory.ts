import type { FastifyInstance } from "fastify";

type RoutingMemorySignal = {
  assigneeId: string;
  support: number;
  averageConfidence: number;
  reasons: string[];
};

export type RoutingMemoryContext = {
  sampleSize: number;
  topSignals: RoutingMemorySignal[];
};

function isMissingSchemaCache(error: { code?: string } | null | undefined): boolean {
  return error?.code === "PGRST205" || error?.code === "PGRST204";
}

function normalizeSkills(input: unknown): string[] {
  if (!Array.isArray(input)) {
    return [];
  }

  return input
    .filter((value): value is string => typeof value === "string")
    .map((value) => value.trim().toLowerCase())
    .filter((value) => value.length > 0);
}

export function buildRoutingMemoryContext(params: {
  historyRows: Array<{ suggested: unknown; confirmed: unknown }>;
  candidateIds: Set<string>;
  taskSkills: string[];
}): RoutingMemoryContext {
  const signalByAssignee = new Map<
    string,
    { support: number; confidenceTotal: number; reasons: string[] }
  >();

  for (const row of params.historyRows) {
    const confirmed = Array.isArray(row.confirmed) ? row.confirmed : [];
    const suggested = Array.isArray(row.suggested) ? row.suggested : [];
    const source = confirmed.length > 0 ? confirmed : suggested;

    for (const suggestion of source) {
      if (!suggestion || typeof suggestion !== "object") {
        continue;
      }

      const candidate = suggestion as {
        assigneeId?: unknown;
        confidence?: unknown;
        reason?: unknown;
        requiredSkills?: unknown;
      };

      const assigneeId = typeof candidate.assigneeId === "string" ? candidate.assigneeId : null;
      if (!assigneeId || !params.candidateIds.has(assigneeId)) {
        continue;
      }

      const historicalSkills = normalizeSkills(candidate.requiredSkills);
      const overlapsTaskSkills = params.taskSkills.length === 0
        ? true
        : historicalSkills.some((skill) => params.taskSkills.includes(skill));

      if (!overlapsTaskSkills) {
        continue;
      }

      const confidence = typeof candidate.confidence === "number" && Number.isFinite(candidate.confidence)
        ? Math.max(0, Math.min(1, candidate.confidence))
        : 0.5;

      const reason = typeof candidate.reason === "string" ? candidate.reason.trim() : "";
      const entry = signalByAssignee.get(assigneeId) ?? { support: 0, confidenceTotal: 0, reasons: [] };
      entry.support += 1;
      entry.confidenceTotal += confidence;
      if (reason.length > 0 && entry.reasons.length < 4 && !entry.reasons.includes(reason)) {
        entry.reasons.push(reason);
      }
      signalByAssignee.set(assigneeId, entry);
    }
  }

  const topSignals = Array.from(signalByAssignee.entries())
    .map(([assigneeId, value]) => ({
      assigneeId,
      support: value.support,
      averageConfidence: Number((value.confidenceTotal / value.support).toFixed(3)),
      reasons: value.reasons
    }))
    .sort((a, b) => {
      if (a.support !== b.support) {
        return b.support - a.support;
      }
      return b.averageConfidence - a.averageConfidence;
    })
    .slice(0, 8);

  return {
    sampleSize: params.historyRows.length,
    topSignals
  };
}

export async function fetchRoutingMemoryContext(
  fastify: FastifyInstance,
  task: {
    id: string;
    assigned_role: "ceo" | "cfo" | "manager" | "worker";
    org_id?: string | null;
    required_skills: string[] | null;
  },
  candidateIds: Set<string>
): Promise<RoutingMemoryContext> {
  if (candidateIds.size === 0) {
    return { sampleSize: 0, topSignals: [] };
  }

  if (!task.org_id) {
    return { sampleSize: 0, topSignals: [] };
  }

  const recentTasksResult = await fastify.supabaseService
    .from("tasks")
    .select("id")
    .eq("org_id", task.org_id)
    .eq("assigned_role", task.assigned_role)
    .neq("id", task.id)
    .order("updated_at", { ascending: false })
    .limit(120);

  if (recentTasksResult.error) {
    if (isMissingSchemaCache(recentTasksResult.error)) {
      fastify.log.warn({ err: recentTasksResult.error }, "Skipping routing memory fetch; tasks schema unavailable");
      return { sampleSize: 0, topSignals: [] };
    }
    throw new Error(`Unable to load routing memory tasks: ${recentTasksResult.error.message}`);
  }

  const taskIds = (recentTasksResult.data ?? []).map((row) => String(row.id));
  if (taskIds.length === 0) {
    return { sampleSize: 0, topSignals: [] };
  }

  const memoryRowsResult = await fastify.supabaseService
    .from("routing_suggestions")
    .select("suggested, confirmed, created_at")
    .in("task_id", taskIds)
    .order("created_at", { ascending: false })
    .limit(150);

  if (memoryRowsResult.error) {
    if (isMissingSchemaCache(memoryRowsResult.error)) {
      fastify.log.warn({ err: memoryRowsResult.error }, "Skipping routing memory fetch; routing_suggestions schema unavailable");
      return { sampleSize: 0, topSignals: [] };
    }
    throw new Error(`Unable to load routing memory suggestions: ${memoryRowsResult.error.message}`);
  }

  const taskSkills = normalizeSkills(task.required_skills);

  return buildRoutingMemoryContext({
    historyRows: (memoryRowsResult.data ?? []).map((row) => ({
      suggested: row.suggested,
      confirmed: row.confirmed
    })),
    candidateIds,
    taskSkills
  });
}

export async function persistRoutingOutcome(
  fastify: FastifyInstance,
  params: {
    taskId: string;
    suggested: unknown;
    confirmed: unknown;
    outcome: "confirmed" | "rejected";
  }
): Promise<void> {
  const response = await fastify.supabaseService.from("routing_suggestions").insert({
    task_id: params.taskId,
    suggested: params.suggested,
    confirmed: params.confirmed,
    outcome: params.outcome
  });

  if (response.error) {
    fastify.log.warn({ err: response.error, taskId: params.taskId }, "Unable to persist routing outcome audit");
  }
}
