/**
 * Reciprocal rank fusion for combining ranked retrieval lists (e.g. vector + lexical).
 * @see https://plg.uwaterloo.ca/~gvcormac/cormacks/cmp36-ls.pdf (classic RRF intuition)
 */

export interface RrfMergeableHit {
  id: string;
  sourceType: string;
  sourceId: string | null;
  chunkIndex: number;
  score: number;
  textSnippet: string;
  metadata: Record<string, unknown>;
}

export function sectionResultKey(hit: {
  id: string;
  sourceType: string;
  sourceId: string | null;
  chunkIndex: number;
}): string {
  return `${hit.sourceType}:${hit.sourceId ?? "none"}:${hit.chunkIndex}:${hit.id}`;
}

/**
 * @param rankedLists — each inner array: best-first (rank 1 = index 0 + 1)
 * @param k — RRF constant (typical 60)
 */
export function reciprocalRankFusionMerge(
  rankedLists: RrfMergeableHit[][],
  topK: number,
  k = 60
): RrfMergeableHit[] {
  const nonEmpty = rankedLists.filter((list) => list.length > 0);
  if (nonEmpty.length === 0) {
    return [];
  }

  const rrfByKey = new Map<string, number>();
  const canonicalByKey = new Map<string, RrfMergeableHit>();
  const listsContainingKey = new Map<string, Set<number>>();

  nonEmpty.forEach((list, listIndex) => {
    list.forEach((hit, index) => {
      const rank = index + 1;
      const key = sectionResultKey(hit);
      const add = 1 / (k + rank);
      rrfByKey.set(key, (rrfByKey.get(key) ?? 0) + add);

      if (!listsContainingKey.has(key)) {
        listsContainingKey.set(key, new Set());
      }
      listsContainingKey.get(key)!.add(listIndex);

      const prev = canonicalByKey.get(key);
      if (!prev || hit.textSnippet.length > prev.textSnippet.length) {
        canonicalByKey.set(key, { ...hit });
      }
    });
  });

  return [...rrfByKey.entries()]
    .sort((left, right) => right[1] - left[1])
    .slice(0, topK)
    .map(([key, rrfScore]) => {
      const base = canonicalByKey.get(key)!;
      const multiList = (listsContainingKey.get(key)?.size ?? 0) > 1;
      return {
        ...base,
        score: rrfScore,
        metadata: {
          ...base.metadata,
          retrievalSource: multiList ? "hybrid_rrf" : (base.metadata.retrievalSource as string) ?? "unknown",
          rrfScore
        }
      };
    });
}

export function mergeSearchResultsScoreSum(
  vectorResults: RrfMergeableHit[],
  lexicalResults: RrfMergeableHit[],
  topK: number
): RrfMergeableHit[] {
  const merged = new Map<string, RrfMergeableHit>();
  for (const result of [...vectorResults, ...lexicalResults]) {
    const key = sectionResultKey(result);
    const existing = merged.get(key);
    if (!existing) {
      merged.set(key, result);
      continue;
    }
    merged.set(key, {
      ...existing,
      score: existing.score + result.score,
      textSnippet: existing.textSnippet.length >= result.textSnippet.length ? existing.textSnippet : result.textSnippet,
      metadata: {
        ...existing.metadata,
        ...result.metadata,
        retrievalSource: "hybrid"
      }
    });
  }

  return [...merged.values()]
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}
