/**
 * Resolves whether embedding ingest runs after document upload.
 * @see docs/adr/adr-0002-vectorless-default-retrieval.md
 */

export type DocumentRetrievalMode = "vectorless" | "vector" | "hybrid";

export interface EmbeddingIngestResolution {
  /** Value persisted on org_documents.retrieval_mode */
  storedRetrievalMode: DocumentRetrievalMode;
  enqueueEmbeddingJob: boolean;
  /** Merged into ingestion_warnings on the row */
  ingestionNotes: string[];
}

export function resolveEmbeddingIngestPlan(
  requested: DocumentRetrievalMode,
  hasOpenAiKey: boolean
): EmbeddingIngestResolution {
  const ingestionNotes: string[] = [];

  if (requested === "vectorless") {
    return { storedRetrievalMode: "vectorless", enqueueEmbeddingJob: false, ingestionNotes };
  }

  if (!hasOpenAiKey) {
    ingestionNotes.push(
      "Requested vector or hybrid retrieval but OPENAI_API_KEY is not set; document stored as vectorless (sections only, no embedding ingest)."
    );
    return { storedRetrievalMode: "vectorless", enqueueEmbeddingJob: false, ingestionNotes };
  }

  if (requested === "vector") {
    return { storedRetrievalMode: "vector", enqueueEmbeddingJob: true, ingestionNotes };
  }

  return { storedRetrievalMode: "hybrid", enqueueEmbeddingJob: true, ingestionNotes };
}

export function hasOpenAiEmbeddingKey(): boolean {
  return Boolean(process.env.OPENAI_API_KEY?.trim());
}
