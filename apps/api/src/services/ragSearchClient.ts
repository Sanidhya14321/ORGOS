import type { SupabaseClient } from "@supabase/supabase-js";
import type { OrgDocumentSection } from "@orgos/shared-types";
import embeddingService from "./embeddingService.js";
import { isQdrantVectorStoreEnabled, searchQdrantVectors } from "./qdrantVectorStore.js";
import { RAG_SNIPPET_MAX_CHARS, ragCandidateLimit } from "./ragConfig.js";
import { retrieveRelevantSections } from "./ragRetrieval.js";
import {
  mergeSearchResultsScoreSum,
  reciprocalRankFusionMerge
} from "./ragSearchMerge.js";

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

function toVectorLiteral(values: number[]): string {
  return `[${values.join(",")}]`;
}

function mapFallbackSection(section: OrgDocumentSection, score: number, maxSnippetChars = RAG_SNIPPET_MAX_CHARS): RagSearchResult {
  return {
    id: section.id,
    sourceType: "document_section",
    sourceId: section.document_id,
    chunkIndex: section.section_index,
    score,
    textSnippet: section.content.slice(0, maxSnippetChars),
    metadata: {
      heading: section.heading,
      pageStart: section.page_start,
      pageEnd: section.page_end,
      department: section.department,
      branchId: section.branch_id,
      docType: section.doc_type ?? "other",
      knowledgeScope: section.knowledge_scope ?? [],
      sourceFormat: section.source_format ?? "unknown",
      retrievalSource: "lexical"
    }
  };
}

export function createSupabaseRagSearchClient(
  supabase: SupabaseClient,
  options?: { useRrfMerge?: boolean }
) {
  const useRrfMerge = options?.useRrfMerge ?? process.env.ORGOS_RAG_MERGE_RRF === "1";

  return {
    async search({
      orgId,
      query,
      topK = 5,
      branchId,
      department,
      docTypes,
      knowledgeScopes,
      sourceFormats,
      sourceTypes
    }: {
      orgId: string;
      query: string;
      topK?: number;
      branchId?: string | null;
      department?: string | null;
      docTypes?: string[];
      knowledgeScopes?: string[];
      sourceFormats?: string[];
      sourceTypes?: string[];
    }): Promise<RagSearchResult[]> {
      let queryEmbedding: number[] | undefined;
      try {
        [queryEmbedding] = await embeddingService.embedTexts([query]);
      } catch {
        queryEmbedding = undefined;
      }
      const fallbackSections = await retrieveRelevantSections(supabase, {
        orgId,
        goalInput: query,
        topN: ragCandidateLimit(topK),
        ...(branchId !== undefined ? { branchId } : {}),
        ...(department !== undefined ? { department } : {}),
        ...(docTypes !== undefined ? { docTypes } : {}),
        ...(knowledgeScopes !== undefined ? { knowledgeScopes } : {}),
        ...(sourceFormats !== undefined ? { sourceFormats } : {})
      });

      const lexicalResults = fallbackSections.map((section, index) =>
        mapFallbackSection(section, Math.max(0.2, 0.7 - index * 0.05))
      );

      let vectorResults: RagSearchResult[] = [];
      if (queryEmbedding && Array.isArray(queryEmbedding)) {
        if (isQdrantVectorStoreEnabled()) {
          try {
            const qdrantParams: Parameters<typeof searchQdrantVectors>[0] = {
              orgId,
              queryVector: queryEmbedding,
              topK
            };
            if (branchId !== undefined) {
              qdrantParams.branchId = branchId;
            }
            if (department !== undefined) {
              qdrantParams.department = department;
            }
            if (docTypes !== undefined) {
              qdrantParams.docTypes = docTypes;
            }
            if (knowledgeScopes !== undefined) {
              qdrantParams.knowledgeScopes = knowledgeScopes;
            }
            if (sourceFormats !== undefined) {
              qdrantParams.sourceFormats = sourceFormats;
            }
            if (sourceTypes !== undefined) {
              qdrantParams.sourceTypes = sourceTypes;
            }
            vectorResults = await searchQdrantVectors(qdrantParams);
          } catch (err) {
            console.warn("[ragSearchClient] Qdrant search failed; falling back to Postgres", err);
          }
        }

        if (vectorResults.length === 0) {
          const rpcResult = await supabase.rpc("match_embeddings", {
          p_org_id: orgId,
          p_query_embedding: toVectorLiteral(queryEmbedding),
          p_match_count: topK,
          p_source_types: sourceTypes ?? ["document_section", "report", "meeting_ingestion"],
          p_doc_types: docTypes ?? null,
          p_department: department ?? null,
          p_branch_id: branchId ?? null,
          p_knowledge_scopes: knowledgeScopes ?? null
        });

        if (rpcResult.data && Array.isArray(rpcResult.data)) {
          vectorResults = (rpcResult.data as Array<Record<string, unknown>>).map((row) => ({
            id: String(row.id),
            sourceType: String(row.source_type ?? "unknown"),
            sourceId: (row.source_id as string | null) ?? null,
            chunkIndex: Number(row.chunk_index ?? 0),
            score: Number(row.score ?? 0),
            textSnippet: String(row.text_snippet ?? ""),
            metadata: {
              ...((row.metadata as Record<string, unknown>) ?? {}),
              retrievalSource: "vector"
            }
          }));
        } else {
          const { data, error } = await supabase
            .from("embeddings")
            .select("id, source_type, source_id, chunk_index, text_snippet, metadata, embedding")
            .eq("org_id", orgId)
            .limit(1000);

          if (!error && data && data.length > 0) {
            const inMemoryResults = (data as Array<Record<string, unknown>>)
              .map((row) => {
                const embedding = row.embedding;
                const metadata = (row.metadata as Record<string, unknown>) || {};
                if (!Array.isArray(embedding)) {
                  return null;
                }
                if (sourceTypes && sourceTypes.length > 0 && !sourceTypes.includes(String(row.source_type ?? ""))) {
                  return null;
                }
                if (department && metadata.department && metadata.department !== department) {
                  return null;
                }
                if (branchId && metadata.branchId && metadata.branchId !== branchId) {
                  return null;
                }
                if (docTypes && docTypes.length > 0 && metadata.docType && !docTypes.includes(String(metadata.docType))) {
                  return null;
                }
                if (
                  knowledgeScopes &&
                  knowledgeScopes.length > 0 &&
                  Array.isArray(metadata.knowledgeScope) &&
                  !metadata.knowledgeScope.some((scope) => knowledgeScopes.includes(String(scope)))
                ) {
                  return null;
                }

                return {
                  id: String(row.id),
                  sourceType: String(row.source_type ?? "unknown"),
                  sourceId: (row.source_id as string | null) ?? null,
                  chunkIndex: Number(row.chunk_index ?? 0),
                  score: cosineSimilarity(queryEmbedding as number[], embedding as number[]),
                  textSnippet: String(row.text_snippet ?? ""),
                  metadata: {
                    ...metadata,
                    retrievalSource: "vector"
                  }
                };
              })
              .filter((item) => item !== null) as RagSearchResult[];
            const sorted = inMemoryResults.slice().sort((left, right) => right.score - left.score);
            vectorResults = sorted.slice(0, topK);
          }
        }
        }
      }

      const merged = useRrfMerge
        ? reciprocalRankFusionMerge([vectorResults, lexicalResults], ragCandidateLimit(topK))
        : mergeSearchResultsScoreSum(vectorResults, lexicalResults, ragCandidateLimit(topK));

      return merged.slice(0, topK);
    }
  };
}
