function readPositiveInt(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseInt(raw, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function readPositiveFloat(envKey: string, fallback: number): number {
  const raw = process.env[envKey];
  if (!raw) {
    return fallback;
  }
  const parsed = Number.parseFloat(raw);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

/** Max chars per retrieved snippet sent to LLMs (agents + hybrid search). */
export const RAG_SNIPPET_MAX_CHARS = readPositiveInt("ORGOS_RAG_SNIPPET_CHARS", 1200);

/** Max chars per section excerpt in help / buildRAGContext. */
export const RAG_CONTEXT_EXCERPT_CHARS = readPositiveInt("ORGOS_RAG_EXCERPT_CHARS", 2000);

/** Minimum Jaccard score unless substring token match (see ragRetrieval). */
export const RAG_LEXICAL_THRESHOLD = readPositiveFloat("ORGOS_RAG_LEXICAL_THRESHOLD", 0.08);

/** Widen lexical candidate pool before top-K trim. */
export const RAG_RETRIEVAL_CANDIDATE_MULTIPLIER = readPositiveInt("ORGOS_RAG_CANDIDATE_MULTIPLIER", 3);

export const RAG_HELP_TOP_SECTIONS = readPositiveInt("ORGOS_RAG_HELP_TOP_SECTIONS", 10);

export function ragCandidateLimit(topN: number): number {
  return Math.min(Math.max(topN * RAG_RETRIEVAL_CANDIDATE_MULTIPLIER, 12), 40);
}
