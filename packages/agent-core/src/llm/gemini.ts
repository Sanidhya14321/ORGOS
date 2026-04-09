import { GoogleGenerativeAI } from "@google/generative-ai";
import { LLMProviderError, LLMTimeoutError, RateLimitError } from "./errors.js";
import type { LLMMessage, LLMOptions, LLMProvider, LLMResponse } from "./provider.js";

const GEMINI_MODEL = "gemini-1.5-flash";

type GeminiRole = "user" | "model";

function toGeminiRole(role: LLMMessage["role"]): GeminiRole {
  return role === "assistant" ? "model" : "user";
}

export class GeminiProvider implements LLMProvider {
  name = "gemini";

  async complete(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse> {
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new LLMProviderError("Missing GEMINI_API_KEY");
    }

    const client = new GoogleGenerativeAI(apiKey);
    const model = client.getGenerativeModel({ model: GEMINI_MODEL });

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 30_000);
    const startedAt = Date.now();

    try {
      const systemMessages = messages.filter((message) => message.role === "system").map((m) => m.content);
      const nonSystemMessages = messages.filter((message) => message.role !== "system");

      const promptParts = [
        ...(systemMessages.length > 0 ? [`System instructions:\n${systemMessages.join("\n\n")}`] : []),
        ...nonSystemMessages.map((msg) => `${msg.role.toUpperCase()}: ${msg.content}`)
      ];

      const chatHistory = nonSystemMessages.slice(0, -1).map((message) => ({
        role: toGeminiRole(message.role),
        parts: [{ text: message.content }]
      }));

      const generationConfig: { temperature?: number; maxOutputTokens?: number } = {};
      if (opts?.temperature !== undefined) {
        generationConfig.temperature = opts.temperature;
      }
      if (opts?.maxTokens !== undefined) {
        generationConfig.maxOutputTokens = opts.maxTokens;
      }

      const chat = model.startChat({
        history: chatHistory,
        generationConfig
      });

      const latestPrompt = promptParts[promptParts.length - 1] ?? "";
      const result = await chat.sendMessage(latestPrompt);

      const text = result.response.text();
      if (!text) {
        throw new LLMProviderError("Gemini returned empty content");
      }

      const usage = result.response.usageMetadata;

      return {
        content: text,
        promptTokens: usage?.promptTokenCount ?? 0,
        compTokens: usage?.candidatesTokenCount ?? 0,
        latencyMs: Date.now() - startedAt
      };
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown Gemini error";

      if (message.includes("429") || message.toLowerCase().includes("rate limit")) {
        throw new RateLimitError("Gemini rate limit reached");
      }

      if (error instanceof Error && error.name === "AbortError") {
        throw new LLMTimeoutError("Gemini request timed out after 30s");
      }

      throw new LLMProviderError(message);
    } finally {
      clearTimeout(timeout);
    }
  }
}
