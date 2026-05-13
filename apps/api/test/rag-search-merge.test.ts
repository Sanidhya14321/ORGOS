import test from "node:test";
import assert from "node:assert/strict";
import {
  mergeSearchResultsScoreSum,
  reciprocalRankFusionMerge,
  sectionResultKey
} from "../src/services/ragSearchMerge.js";
import type { RrfMergeableHit } from "../src/services/ragSearchMerge.js";

function hit(partial: Partial<RrfMergeableHit> & Pick<RrfMergeableHit, "id">): RrfMergeableHit {
  return {
    sourceType: "document_section",
    sourceId: "doc-1",
    chunkIndex: 0,
    score: 0.5,
    textSnippet: "x",
    metadata: { retrievalSource: "vector" },
    ...partial
  };
}

test("sectionResultKey stable across same logical section", () => {
  const a = hit({ id: "s1", chunkIndex: 2, sourceId: null });
  const b = hit({ id: "s1", chunkIndex: 2, sourceId: null });
  assert.equal(sectionResultKey(a), sectionResultKey(b));
});

test("mergeSearchResultsScoreSum sums scores and caps topK", () => {
  const v = [hit({ id: "a", score: 0.8, metadata: { retrievalSource: "vector" } })];
  const l = [hit({ id: "a", score: 0.3, textSnippet: "longer snippet here", metadata: { retrievalSource: "lexical" } })];
  const out = mergeSearchResultsScoreSum(v, l, 5);
  assert.equal(out.length, 1);
  assert.equal(out[0]!.score, 1.1);
  assert.equal(out[0]!.textSnippet, "longer snippet here");
  assert.equal(out[0]!.metadata.retrievalSource, "hybrid");
});

test("reciprocalRankFusionMerge boosts item in both lists", () => {
  const shared = hit({ id: "shared", textSnippet: "from first" });
  const onlyVec = hit({ id: "vec-only" });
  const onlyLex = hit({ id: "lex-only" });
  const vec = [shared, onlyVec];
  const lex = [shared, onlyLex];
  const out = reciprocalRankFusionMerge([vec, lex], 10, 60);
  const sharedRow = out.find((h) => h.id === "shared");
  assert.ok(sharedRow);
  assert.equal(sharedRow!.metadata.retrievalSource, "hybrid_rrf");
  assert.equal(typeof sharedRow!.metadata.rrfScore, "number");
});

test("reciprocalRankFusionMerge single-list hit keeps non-hybrid_rrf source label", () => {
  const onlyLex = hit({ id: "lex-only", metadata: { retrievalSource: "lexical" } });
  const out = reciprocalRankFusionMerge([[onlyLex]], 5);
  assert.equal(out.length, 1);
  assert.notEqual(out[0]!.metadata.retrievalSource, "hybrid_rrf");
});
