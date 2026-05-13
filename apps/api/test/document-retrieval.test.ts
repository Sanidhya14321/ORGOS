import test from "node:test";
import assert from "node:assert/strict";
import { resolveEmbeddingIngestPlan } from "../src/services/documentRetrieval.js";

test("resolveEmbeddingIngestPlan vectorless never enqueues", () => {
  const withKey = resolveEmbeddingIngestPlan("vectorless", true);
  assert.equal(withKey.storedRetrievalMode, "vectorless");
  assert.equal(withKey.enqueueEmbeddingJob, false);
  assert.equal(withKey.ingestionNotes.length, 0);
});

test("resolveEmbeddingIngestPlan vector without key downgrades", () => {
  const r = resolveEmbeddingIngestPlan("vector", false);
  assert.equal(r.storedRetrievalMode, "vectorless");
  assert.equal(r.enqueueEmbeddingJob, false);
  assert.ok(r.ingestionNotes.some((n) => n.includes("OPENAI_API_KEY")));
});

test("resolveEmbeddingIngestPlan vector with key", () => {
  const r = resolveEmbeddingIngestPlan("vector", true);
  assert.equal(r.storedRetrievalMode, "vector");
  assert.equal(r.enqueueEmbeddingJob, true);
});

test("resolveEmbeddingIngestPlan hybrid with key", () => {
  const r = resolveEmbeddingIngestPlan("hybrid", true);
  assert.equal(r.storedRetrievalMode, "hybrid");
  assert.equal(r.enqueueEmbeddingJob, true);
});

test("resolveEmbeddingIngestPlan hybrid without key downgrades", () => {
  const r = resolveEmbeddingIngestPlan("hybrid", false);
  assert.equal(r.storedRetrievalMode, "vectorless");
  assert.equal(r.enqueueEmbeddingJob, false);
});
