import type { SupabaseClient } from "@supabase/supabase-js";
import embeddingService from "./embeddingService.js";

export interface RagSearchResult {
  id: string;
  sourceType: string;
  sourceId: string | null;
  chunkIndex: number;
  score: number;
  textSnippet: string;
  metadata: Record<string, unknown>;
}

function cosineSimilarity(a: number[] | undefined, b: number[] | undefined): number {
  if (!a || !b || a.length === 0 || b.length === 0) return 0;
  let dot = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i += 1) {
    dot += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) {
    return 0;
  }

  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}

export function createSupabaseRagSearchClient(supabase: SupabaseClient) {
  return {
    async search({ orgId, query, topK = 5 }: { orgId: string; query: string; topK?: number }): Promise<RagSearchResult[]> {
      const [queryEmbedding] = await embeddingService.embedTexts([query]);
      if (!queryEmbedding || !Array.isArray(queryEmbedding)) return [];

      const { data, error } = await supabase
        .from("embeddings")
        .select("id, source_type, source_id, chunk_index, text_snippet, metadata, embedding")
        .eq("org_id", orgId)
        .limit(1000);

      if (error || !data) {
        return [];
      }

      const scored = (data as Array<Record<string, unknown>>)
        .map((row) => {
          const embedding = row.embedding;
          if (!Array.isArray(embedding)) {
            return null;
          }

          return {
            id: String(row.id),
            sourceType: String(row.source_type ?? "unknown"),
            sourceId: (row.source_id as string | null) ?? null,
            chunkIndex: Number(row.chunk_index ?? 0),
            score: cosineSimilarity(queryEmbedding as number[], embedding as number[]),
            textSnippet: String(row.text_snippet ?? ""),
            metadata: (row.metadata as Record<string, unknown>) || {}
          };
        })
        .filter((item): item is RagSearchResult => {
          return item !== null && item.metadata !== undefined;
        })
        .sort((left, right) => (right?.score ?? 0) - (left?.score ?? 0))
        .slice(0, topK) as RagSearchResult[];

      return scored;
    }
  };
}
