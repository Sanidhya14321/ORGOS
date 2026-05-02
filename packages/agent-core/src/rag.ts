import type { LLMMessage } from "./llm/provider.js";

export interface RagDocument {
  id: string;
  sourceType: string;
  sourceId?: string | null;
  chunkIndex?: number;
  score: number;
  textSnippet: string;
  metadata?: Record<string, unknown>;
}

export interface RagSearchRequest {
  orgId: string;
  query: string;
  topK?: number;
}

export interface RagSearchClient {
  search(request: RagSearchRequest): Promise<RagDocument[]>;
}

export interface RagContextOptions {
  orgId: string;
  query: string;
  topK?: number;
  maxSnippetChars?: number;
}

function truncateSnippet(value: string, limit: number): string {
  if (value.length <= limit) {
    return value;
  }

  return `${value.slice(0, limit - 1).trimEnd()}…`;
}

export function formatRagContext(documents: RagDocument[], maxSnippetChars = 500): string {
  if (documents.length === 0) {
    return "No retrieval context was found.";
  }

  const lines = ["Retrieved context:"];
  for (const document of documents) {
    lines.push(
      `- [${document.sourceType}${document.sourceId ? `:${document.sourceId}` : ""}] score=${document.score.toFixed(3)} ${truncateSnippet(document.textSnippet, maxSnippetChars)}`
    );
  }

  return lines.join("\n");
}

export function injectRagContext(messages: LLMMessage[], contextBlock: string): LLMMessage[] {
  const systemMessage: LLMMessage = {
    role: "system",
    content: [
      "Use the retrieved context below when it is relevant.",
      "Cite conflicts or uncertainty explicitly.",
      contextBlock
    ].join("\n")
  };

  const firstUserIndex = messages.findIndex((message) => message.role === "user");
  if (firstUserIndex < 0) {
    return [systemMessage, ...messages];
  }

  return [...messages.slice(0, firstUserIndex), systemMessage, ...messages.slice(firstUserIndex)];
}

export async function buildRagAugmentedMessages(
  messages: LLMMessage[],
  searchClient: RagSearchClient,
  options: RagContextOptions
): Promise<{ messages: LLMMessage[]; documents: RagDocument[] }> {
  const documents = await searchClient.search({
    orgId: options.orgId,
    query: options.query,
    topK: options.topK ?? 5
  });

  const contextBlock = formatRagContext(documents, options.maxSnippetChars ?? 500);
  return {
    messages: injectRagContext(messages, contextBlock),
    documents
  };
}
