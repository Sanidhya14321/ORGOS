import { LLMProviderError, LLMTimeoutError, RateLimitError } from "./errors.js";
import type { LLMMessage, LLMOptions, LLMProvider, LLMResponse } from "./provider.js";

const GROQ_MODEL = "llama-3.1-70b-versatile";
const GROQ_ENDPOINT = "https://api.groq.com/openai/v1/chat/completions";

interface GroqUsage {
  prompt_tokens?: number;
  completion_tokens?: number;
}

interface GroqChoice {
  message?: { content?: string };
}

interface GroqResponse {
  choices?: GroqChoice[];
  usage?: GroqUsage;
}

export class GroqProvider implements LLMProvider {
  name = "groq";

  async complete(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse> {
    const apiKey = process.env.GROQ_API_KEY;
    if (!apiKey) {
      throw new LLMProviderError("Missing GROQ_API_KEY");
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const startedAt = Date.now();

    try {
      const response = await fetch(GROQ_ENDPOINT, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${apiKey}`
        },
        body: JSON.stringify({
          model: GROQ_MODEL,
          messages,
          temperature: opts?.temperature,
          max_tokens: opts?.maxTokens
        }),
        signal: controller.signal
      });

      if (response.status === 429) {
        throw new RateLimitError("Groq rate limit reached");
      }

      if (!response.ok) {
        throw new LLMProviderError(`Groq request failed: ${response.status}`, response.status);
      }

      const json = (await response.json()) as GroqResponse;
      const content = json.choices?.[0]?.message?.content;
      if (!content) {
        throw new LLMProviderError("Groq returned empty content");
      }

      return {
        content,
        promptTokens: json.usage?.prompt_tokens ?? 0,
        compTokens: json.usage?.completion_tokens ?? 0,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      if (error instanceof RateLimitError || error instanceof LLMProviderError) {
        throw error;
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMTimeoutError("Groq request timed out after 30s");
      }

      throw new LLMProviderError(error instanceof Error ? error.message : "Unknown Groq error");
    } finally {
      clearTimeout(timeout);
    }
  }
}
