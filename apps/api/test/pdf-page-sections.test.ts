import test from "node:test";
import assert from "node:assert/strict";
import { buildDocumentSectionsForIndexing } from "../src/services/ragRetrieval.js";

test("buildDocumentSectionsForIndexing uses real PDF page numbers", () => {
  const sections = buildDocumentSectionsForIndexing("", {
    sourceFormat: "pdf",
    pdfPages: [
      { pageNumber: 2, text: "incident response playbook alpha" },
      { pageNumber: 5, text: "budget overview" }
    ]
  });

  assert.equal(sections.length, 2);
  assert.equal(sections[0]?.page_start, 2);
  assert.equal(sections[0]?.page_end, 2);
  assert.equal(sections[1]?.page_start, 5);
  assert.equal(sections[1]?.page_end, 5);
  assert.ok((sections[0]?.keyword_terms?.length ?? 0) > 0);
});

test("non-PDF falls back to paragraph sections", () => {
  const text = "First block here.\n\nSecond block with more content for keywords about incident handling.";
  const sections = buildDocumentSectionsForIndexing(text, { sourceFormat: "txt" });
  assert.ok(sections.length >= 1);
});
