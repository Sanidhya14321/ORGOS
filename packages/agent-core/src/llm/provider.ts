export type LLMRole = "system" | "user" | "assistant";

export interface LLMMessage {
  role: LLMRole;
  content: string;
}

export interface LLMOptions {
  temperature?: number;
  maxTokens?: number;
}

export interface LLMResponse {
  content: string;
  promptTokens: number;
  compTokens: number;
  latencyMs: number;
}

export interface LLMProvider {
  name: string;
  complete(messages: LLMMessage[], opts?: LLMOptions): Promise<LLMResponse>;
}
