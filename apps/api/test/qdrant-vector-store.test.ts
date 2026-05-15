import test from "node:test";
import assert from "node:assert/strict";
import { qdrantPointUuid } from "../src/services/qdrantVectorStore.js";

test("qdrantPointUuid is stable for same inputs", () => {
  const a = qdrantPointUuid("org-1", "document_section", "doc-2", 3);
  const b = qdrantPointUuid("org-1", "document_section", "doc-2", 3);
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f-]{36}$/);
});

test("qdrantPointUuid differs on chunk index", () => {
  const a = qdrantPointUuid("org-1", "document_section", "doc-2", 0);
  const b = qdrantPointUuid("org-1", "document_section", "doc-2", 1);
  assert.notEqual(a, b);
});
