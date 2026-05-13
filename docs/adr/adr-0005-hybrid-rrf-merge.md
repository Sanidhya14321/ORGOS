# ADR 0005: Optional reciprocal rank fusion for hybrid RAG merge

## Status

Accepted

## Context

Hybrid retrieval returns two ranked lists (vector RPC / in-memory cosine + lexical sections). Naive score-sum merge favors raw score scale mismatch and double-counts weak duplicates.

## Decision

- Module [`apps/api/src/services/ragSearchMerge.ts`](../../apps/api/src/services/ragSearchMerge.ts): `mergeSearchResultsScoreSum` (default) and `reciprocalRankFusionMerge` (RRF, `k=60`).
- API: `ORGOS_RAG_MERGE_RRF=1` — field on [`env.ts`](../../apps/api/src/config/env.ts) for `readEnv()` validation at HTTP server bootstrap. `createSupabaseRagSearchClient` resolves merge mode from `process.env.ORGOS_RAG_MERGE_RRF === "1"` (or optional `{ useRrfMerge }`) so code paths with injected Supabase (tests) avoid calling `readEnv()` inside the factory.

## Consequences

- No migration required; pure runtime merge change.
- Tune RRF `k` only if product asks (currently constant in `reciprocalRankFusionMerge`).
