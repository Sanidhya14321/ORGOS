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
          candidates
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
