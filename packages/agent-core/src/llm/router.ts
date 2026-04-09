import { createClient } from "@supabase/supabase-js";
import { GeminiProvider } from "./gemini.js";
import { AllProvidersExhaustedError, LLMTimeoutError, RateLimitError } from "./errors.js";
import { GroqProvider } from "./groq.js";
import type { LLMMessage, LLMOptions, LLMResponse } from "./provider.js";

export interface LLMLogContext {
  agentType?: "ceo_agent" | "manager_agent" | "worker_agent" | "synthesis_agent";
  action?: "decompose" | "assign" | "execute" | "synthesize" | "escalate";
  goalId?: string;
  taskId?: string;
}

const providers = [new GroqProvider(), new GeminiProvider()];

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

  for (const provider of providers) {
    try {
      const result = await provider.complete(messages, opts);
      await logLLMCall(provider.name, messages, result, context);
      return result;
    } catch (error) {
      const err = error instanceof Error ? error : new Error("Unknown provider error");
      failures.push(`${provider.name}: ${err.message}`);

      const fallbackEligible = error instanceof RateLimitError || error instanceof LLMTimeoutError;
      if (fallbackEligible) {
        console.warn(`[llm-router] provider failed, trying fallback: ${provider.name}`, err.message);
        continue;
      }

      const emptyResponse: LLMResponse = {
        content: "",
        promptTokens: 0,
        compTokens: 0,
        latencyMs: 0
      };
      await logLLMCall(provider.name, messages, emptyResponse, context, err.message);
      throw err;
    }
  }

  throw new AllProvidersExhaustedError(failures.join(" | "));
}
