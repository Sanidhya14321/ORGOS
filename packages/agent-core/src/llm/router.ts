import crypto from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { GeminiProvider } from "./gemini.js";
import { AllProvidersExhaustedError } from "./errors.js";
import { GroqProvider } from "./groq.js";
import type { LLMMessage, LLMOptions, LLMResponse } from "./provider.js";
import { resilientComplete } from "./resiliency.js";
import { llmMetrics } from "./metrics.js";

export interface LLMLogContext {
  agentType?: "ceo_agent" | "manager_agent" | "worker_agent" | "synthesis_agent";
  action?: "decompose" | "assign" | "execute" | "synthesize" | "escalate";
  goalId?: string;
  taskId?: string;
}

const groqProvider = new GroqProvider();
const geminiProvider = new GeminiProvider();

type RoutingCandidate = {
  id: string;
  skills?: string[];
  openTaskCount?: number;
};

type RoutingPayload = {
  task?: {
    id?: string;
    title?: string;
    description?: string | null;
    requiredSkills?: string[];
  };
  candidates?: RoutingCandidate[];
};

function buildNonAssignFallbackContent(context?: LLMLogContext): string {
  const fallbackDeadline = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();
  if (context?.action === "decompose") {
    if (context.agentType === "ceo_agent") {
      return JSON.stringify({
        kpi: "Fallback planning path activated",
        feasibility: "medium",
        confidence: 0.4,
        summary: "LLM providers unavailable; returning a safe executive fallback plan.",
        sub_directives: [
          {
            assigned_role: "cfo",
            directive: "Validate budget, risk exposure, and financial readiness for the requested goal.",
            deadline: fallbackDeadline
          },
          {
            assigned_role: "manager",
            directive: "Coordinate operations and delivery planning for the requested goal.",
            deadline: fallbackDeadline
          },
          {
            assigned_role: "manager",
            directive: "Prepare engineering and systems readiness work for the requested goal.",
            deadline: fallbackDeadline
          },
          {
            assigned_role: "worker",
            directive: "Assemble frontline execution checklists, evidence capture, and status reporting for the requested goal.",
            deadline: fallbackDeadline
          }
        ],
        escalate: false
      });
    }

    if (context.agentType === "manager_agent") {
      return JSON.stringify([
        {
          id: crypto.randomUUID(),
          goal_id: context.goalId ?? crypto.randomUUID(),
          parent_id: null,
          depth: 1,
          title: "Create execution checklist",
          description: "Document the concrete steps, owners, and handoffs required to execute the directive.",
          success_criteria: "A complete execution checklist is documented and ready for use by the team.",
          assigned_to: null,
          assigned_role: "worker",
          is_agent_task: false,
          status: "pending",
          deadline: fallbackDeadline
        },
        {
          id: crypto.randomUUID(),
          goal_id: context.goalId ?? crypto.randomUUID(),
          parent_id: null,
          depth: 1,
          title: "Collect readiness evidence",
          description: "Gather the status inputs, blockers, and supporting evidence needed to report progress on the directive.",
          success_criteria: "Status evidence and blockers are collected and attached for manager review.",
          assigned_to: null,
          assigned_role: "worker",
          is_agent_task: false,
          status: "pending",
          deadline: fallbackDeadline
        }
      ]);
    }
  }

  if (context?.action === "execute") {
    return JSON.stringify({
      acknowledged: true,
      eta_hours: 24,
      questions: ["Please clarify blockers while providers recover."],
      confidence: 0.4
    });
  }

  if (context?.action === "synthesize") {
    return JSON.stringify({
      summary: "LLM providers unavailable; generated fallback synthesis.",
      key_findings: ["Source reports should be reviewed manually."],
      contradictions: [],
      recommended_action: "Escalate to manager for manual synthesis review.",
      flagged_items: ["fallback_mode"]
    });
  }

  return JSON.stringify({
    message: "LLM providers unavailable; fallback response generated.",
    escalate: true
  });
}

function tokenize(value: string | null | undefined): string[] {
  if (!value) {
    return [];
  }

  return value
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 3)
    .slice(0, 24);
}

function extractRoutingPayload(messages: LLMMessage[]): RoutingPayload | null {
  const userMessage = [...messages].reverse().find((message) => message.role === "user");
  if (!userMessage) {
    return null;
  }

  try {
    const parsed = JSON.parse(userMessage.content) as RoutingPayload;
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

async function buildRuleBasedFallback(
  messages: LLMMessage[],
  context?: LLMLogContext
): Promise<LLMResponse> {
  const startedAt = Date.now();

  if (context?.action !== "assign") {
    return {
      content: buildNonAssignFallbackContent(context),
      promptTokens: 0,
      compTokens: 0,
      latencyMs: Date.now() - startedAt
    };
  }

  const payload = extractRoutingPayload(messages);

  const safeDefault = {
    suggestions: [] as Array<{ assigneeId: string; reason: string; confidence: number }>
  };

  const candidates = payload?.candidates ?? [];
  const firstCandidate = candidates[0];
  if (!firstCandidate) {
    return {
      content: JSON.stringify(safeDefault),
      promptTokens: 0,
      compTokens: 0,
      latencyMs: Date.now() - startedAt
    };
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!supabaseUrl || !serviceRole) {
    return {
      content: JSON.stringify({
        suggestions: [
          {
            assigneeId: firstCandidate.id,
            reason: "Rule-based fallback selected lowest-latency available candidate",
            confidence: 0.35
          }
        ]
      }),
      promptTokens: 0,
      compTokens: 0,
      latencyMs: Date.now() - startedAt
    };
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  const candidateIds = new Set(candidates.map((candidate) => candidate.id));
  const currentKeywords = new Set([
    ...tokenize(payload?.task?.title),
    ...tokenize(payload?.task?.description ?? null),
    ...((payload?.task?.requiredSkills ?? []).map((skill) => skill.toLowerCase()))
  ]);

  const historyResult = await supabase
    .from("routing_suggestions")
    .select("task_id, suggested, confirmed, outcome, created_at")
    .order("created_at", { ascending: false })
    .limit(200);

  if (historyResult.error || !historyResult.data || historyResult.data.length === 0) {
    return {
      content: JSON.stringify({
        suggestions: [
          {
            assigneeId: firstCandidate.id,
            reason: "Rule-based fallback used default candidate due to missing routing history",
            confidence: 0.3
          }
        ]
      }),
      promptTokens: 0,
      compTokens: 0,
      latencyMs: Date.now() - startedAt
    };
  }

  const taskIds = historyResult.data
    .map((row) => (typeof row.task_id === "string" ? row.task_id : null))
    .filter((id): id is string => !!id)
    .slice(0, 120);

  const titleByTaskId = new Map<string, string>();
  if (taskIds.length > 0) {
    const tasksResult = await supabase.from("tasks").select("id, title").in("id", taskIds);
    if (!tasksResult.error) {
      for (const row of tasksResult.data ?? []) {
        const id = typeof row.id === "string" ? row.id : null;
        const title = typeof row.title === "string" ? row.title : "";
        if (id) {
          titleByTaskId.set(id, title);
        }
      }
    }
  }

  const scoreByCandidate = new Map<string, number>();

  for (const row of historyResult.data) {
    const taskTitle = typeof row.task_id === "string" ? titleByTaskId.get(row.task_id) ?? "" : "";
    const historyKeywords = new Set(tokenize(taskTitle));
    const overlapCount = Array.from(currentKeywords).filter((keyword) => historyKeywords.has(keyword)).length;
    const similarityWeight = overlapCount > 0 ? Math.min(1, overlapCount / 5) : 0.1;

    const source = Array.isArray(row.confirmed) && row.confirmed.length > 0
      ? row.confirmed
      : Array.isArray(row.suggested)
        ? row.suggested
        : [];

    const outcomeText = typeof row.outcome === "string" ? row.outcome.toLowerCase() : "";
    const outcomeWeight = outcomeText.includes("reject")
      ? 0.4
      : outcomeText.includes("complete") || outcomeText.includes("confirm")
        ? 1
        : 0.8;

    for (const item of source) {
      if (!item || typeof item !== "object") {
        continue;
      }

      const assigneeId = typeof (item as { assigneeId?: unknown }).assigneeId === "string"
        ? (item as { assigneeId: string }).assigneeId
        : null;

      if (!assigneeId || !candidateIds.has(assigneeId)) {
        continue;
      }

      const base = scoreByCandidate.get(assigneeId) ?? 0;
      scoreByCandidate.set(assigneeId, base + similarityWeight * outcomeWeight);
    }
  }

  const topCandidate = Array.from(scoreByCandidate.entries())
    .sort((a, b) => b[1] - a[1])[0]?.[0] ?? firstCandidate.id;

  return {
    content: JSON.stringify({
      suggestions: [
        {
          assigneeId: topCandidate,
          reason: "Rule-based fallback matched historical routing outcomes by task keywords",
          confidence: 0.45
        }
      ]
    }),
    promptTokens: 0,
    compTokens: 0,
    latencyMs: Date.now() - startedAt
  };
}

async function logLLMCall(
  providerName: string,
  messages: LLMMessage[],
  response: LLMResponse,
  context?: LLMLogContext,
  error?: string
): Promise<void> {
  const supabaseUrl = process.env.SUPABASE_URL;
  const serviceRole = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !serviceRole) {
    return;
  }

  const supabase = createClient(supabaseUrl, serviceRole, {
    auth: {
      persistSession: false,
      autoRefreshToken: false,
      detectSessionInUrl: false
    }
  });

  await supabase.from("agent_logs").insert({
    agent_type: context?.agentType ?? "manager_agent",
    action: context?.action ?? "decompose",
    goal_id: context?.goalId ?? null,
    task_id: context?.taskId ?? null,
    model: providerName,
    prompt_tokens: response.promptTokens,
    comp_tokens: response.compTokens,
    latency_ms: response.latencyMs,
    input: { messages },
    output: { content: response.content },
    error: error ?? null
  });
}

export async function callLLM(
  messages: LLMMessage[],
  opts?: LLMOptions,
  context?: LLMLogContext
): Promise<LLMResponse> {
  const failures: string[] = [];
  const groqStartedAt = Date.now();

  try {
    const result = await resilientComplete(groqProvider, messages, opts);
    llmMetrics.recordRouterLatency(groqProvider.name, result.latencyMs);
    await logLLMCall(groqProvider.name, messages, result, context);
    return result;
  } catch (error) {
    const elapsed = Date.now() - groqStartedAt;
    llmMetrics.recordRouterLatency(groqProvider.name, elapsed);
    const err = error instanceof Error ? error : new Error("Unknown Groq error");
    failures.push(`${groqProvider.name}: ${err.message}`);
    await logLLMCall(groqProvider.name, messages, {
      content: "",
      promptTokens: 0,
      compTokens: 0,
      latencyMs: elapsed
    }, context, err.message);
    console.warn("[llm-router] groq failed or timed out, trying gemini", err.message);
  }

  const geminiStartedAt = Date.now();
  try {
    const result = await resilientComplete(geminiProvider, messages, opts);
    llmMetrics.recordRouterLatency(geminiProvider.name, result.latencyMs);
    llmMetrics.recordRouterFallback(groqProvider.name, geminiProvider.name);
    await logLLMCall(geminiProvider.name, messages, result, context);
    return result;
  } catch (error) {
    const elapsed = Date.now() - geminiStartedAt;
    llmMetrics.recordRouterLatency(geminiProvider.name, elapsed);
    const err = error instanceof Error ? error : new Error("Unknown Gemini error");
    failures.push(`${geminiProvider.name}: ${err.message}`);
    await logLLMCall(geminiProvider.name, messages, {
      content: "",
      promptTokens: 0,
      compTokens: 0,
      latencyMs: elapsed
    }, context, err.message);
    console.warn("[llm-router] gemini failed or timed out, trying rule-based fallback", err.message);
  }

  const fallbackStartedAt = Date.now();
  try {
    const fallback = await buildRuleBasedFallback(messages, context);
    llmMetrics.recordRouterLatency("rule-based", fallback.latencyMs);
    llmMetrics.recordRouterFallback(geminiProvider.name, "rule-based");
    await logLLMCall("rule-based", messages, fallback, context);
    return fallback;
  } catch (error) {
    const elapsed = Date.now() - fallbackStartedAt;
    llmMetrics.recordRouterLatency("rule-based", elapsed);
    const err = error instanceof Error ? error : new Error("Unknown rule-based fallback error");
    failures.push(`rule-based: ${err.message}`);
    await logLLMCall("rule-based", messages, {
      content: "",
      promptTokens: 0,
      compTokens: 0,
      latencyMs: elapsed
    }, context, err.message);
  }

  llmMetrics.recordAllProvidersExhausted();
  throw new AllProvidersExhaustedError(failures.join(" | "));
}
