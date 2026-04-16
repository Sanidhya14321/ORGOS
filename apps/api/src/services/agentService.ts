import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { callLLM } from "@orgos/agent-core";

const SuggestedAssignmentSchema = z.object({
  assigneeId: z.string().uuid(),
  reason: z.string().trim().min(1).max(400),
  confidence: z.number().min(0).max(1),
  estimatedHours: z.number().min(0).max(200).optional(),
  requiredSkills: z.array(z.string().trim().min(1)).max(30).optional()
});

export const AgentRoutingSuggestionSchema = z.object({
  suggestions: z.array(SuggestedAssignmentSchema).max(20)
});

export type AgentRoutingSuggestion = z.infer<typeof AgentRoutingSuggestionSchema>;

type RoutingMemorySignal = {
  assigneeId: string;
  support: number;
  averageConfidence: number;
  reasons: string[];
};

type RoutingMemoryContext = {
  sampleSize: number;
  topSignals: RoutingMemorySignal[];
};

const ROUTING_SYSTEM_PROMPT = [
  "You are ORGOS routing agent.",
  "Your task is to suggest the best assignees for a task from candidate users.",
  "Tasks flow down only.",
  "Never suggest users with load > 8.",
  "Prefer best skill match and lower load.",
  "Output ONLY valid JSON in the exact format:",
  '{"suggestions":[{"assigneeId":"uuid","reason":"string","confidence":0.0,"estimatedHours":0,"requiredSkills":["skill"]}]}'
].join(" ");

function safeJsonParse(raw: string): unknown {
  const trimmed = raw.trim();
  const withoutFence = trimmed.startsWith("```")
    ? trimmed.replace(/^```[a-zA-Z]*\s*/, "").replace(/```$/, "").trim()
    : trimmed;
  return JSON.parse(withoutFence);
}

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

function buildRoutingMemoryContext(params: {
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

async function fetchRoutingMemoryContext(
  fastify: FastifyInstance,
  task: {
    id: string;
    assigned_role: "ceo" | "cfo" | "manager" | "worker";
    org_id?: string | null;
    required_skills: string[] | null;
  },
  candidateIds: Set<string>
): Promise<RoutingMemoryContext> {
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

export async function suggestRoutingForTask(
  fastify: FastifyInstance,
  taskId: string
): Promise<AgentRoutingSuggestion> {
  const taskResult = await fastify.supabaseService
    .from("tasks")
    .select("id, title, description, required_skills, assigned_role, org_id, created_by")
    .eq("id", taskId)
    .maybeSingle();

  if (taskResult.error || !taskResult.data) {
    throw new Error("Task not found for routing suggestion");
  }

  const task = taskResult.data as {
    id: string;
    title: string;
    description: string | null;
    required_skills: string[] | null;
    assigned_role: "ceo" | "cfo" | "manager" | "worker";
    org_id?: string | null;
    created_by?: string | null;
  };

  let userQuery = fastify.supabaseService
    .from("users")
    .select("id, role, skills, open_task_count")
    .eq("status", "active")
    .eq("role", task.assigned_role)
    .order("open_task_count", { ascending: true })
    .limit(50);

  if (task.org_id) {
    userQuery = userQuery.eq("org_id", task.org_id);
  }

  const candidatesResult = await userQuery;

  if (candidatesResult.error) {
    throw new Error(`Failed to load routing candidates: ${candidatesResult.error.message}`);
  }

  const candidates = (candidatesResult.data ?? [])
    .map((user) => ({
      id: String(user.id),
      skills: Array.isArray(user.skills) ? user.skills.filter((v): v is string => typeof v === "string") : [],
      openTaskCount: Number(user.open_task_count ?? 0)
    }))
    .filter((user) => user.openTaskCount <= 8);

  if (candidates.length === 0) {
    return {
      suggestions: []
    };
  }

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const routingMemory = await fetchRoutingMemoryContext(fastify, task, candidateIds);

  const llmResponse = await callLLM(
    [
      { role: "system", content: ROUTING_SYSTEM_PROMPT },
      {
        role: "user",
        content: JSON.stringify({
          task: {
            id: task.id,
            title: task.title,
            description: task.description,
            requiredSkills: task.required_skills ?? [],
            assignedRole: task.assigned_role
          },
          candidates,
          routingMemory
        })
      }
    ],
    { temperature: 0.1, maxTokens: 1200 },
    { agentType: "manager_agent", action: "assign", taskId: task.id }
  );

  const parsed = safeJsonParse(llmResponse.content);
  const validated = AgentRoutingSuggestionSchema.parse(parsed);

  const allowedAssignees = new Set(candidates.map((candidate) => candidate.id));
  const filtered = validated.suggestions.filter((suggestion) => allowedAssignees.has(suggestion.assigneeId));

  return {
    suggestions: filtered
  };
}
