import assert from "node:assert/strict";
import fs from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";

async function loadBuiltModule(relativePath) {
  const absolutePath = path.resolve(relativePath);
  await fs.access(absolutePath);
  return import(pathToFileURL(absolutePath).href);
}

async function run() {
  const { buildRoutingMemoryContext } = await loadBuiltModule("apps/api/dist/services/routingMemory.js");
  const { buildRAGContext, buildDocumentSectionsForIndexing } = await loadBuiltModule(
    "apps/api/dist/services/ragRetrieval.js"
  );
  const { rerankRagDocumentsByQueryOverlap } = await loadBuiltModule("packages/agent-core/dist/rag.js");

  const routingContext = buildRoutingMemoryContext({
    historyRows: [
      {
        suggested: [
          {
            assigneeId: "11111111-1111-4111-8111-111111111111",
            confidence: 0.9,
            reason: "strong historical fit",
            requiredSkills: ["delivery", "planning"]
          }
        ],
        confirmed: []
      },
      {
        suggested: [],
        confirmed: [
          {
            assigneeId: "11111111-1111-4111-8111-111111111111",
            confidence: 0.7,
            reason: "repeated success",
            requiredSkills: ["planning"]
          }
        ]
      },
      {
        suggested: [
          {
            assigneeId: "22222222-2222-4222-8222-222222222222",
            confidence: 0.95,
            reason: "strong but unrelated skill",
            requiredSkills: ["finance"]
          }
        ],
        confirmed: []
      }
    ],
    candidateIds: new Set([
      "11111111-1111-4111-8111-111111111111",
      "22222222-2222-4222-8222-222222222222"
    ]),
    taskSkills: ["planning"]
  });

  assert.equal(routingContext.sampleSize, 3, "routing eval should inspect all history rows");
  assert.equal(
    routingContext.topSignals[0]?.assigneeId,
    "11111111-1111-4111-8111-111111111111",
    "routing eval should prioritize historically relevant assignees"
  );
  assert.equal(routingContext.topSignals[0]?.support, 2, "routing eval should accumulate support across suggested and confirmed rows");

  const longContent = "A".repeat(1800);
  const ragContext = buildRAGContext("Launch the new workflow", [
    {
      id: "00000000-0000-4000-8000-000000000001",
      org_id: "00000000-0000-4000-8000-000000000002",
      file_name: "handbook.txt",
      file_size: longContent.length,
      mime_type: "text/plain",
      file_content: longContent,
      doc_type: "handbook",
      is_indexed: true,
      uploaded_by: "00000000-0000-4000-8000-000000000003",
      uploaded_at: new Date().toISOString()
    }
  ]);

  assert.match(ragContext.contextInstruction, /\[HANDBOOK: handbook\.txt\]/, "RAG eval should label included documents");
  assert.ok(ragContext.docContexts[0]?.length && ragContext.docContexts[0].length < 1700, "RAG eval should truncate oversized excerpts");

  const pdfSections = buildDocumentSectionsForIndexing("", {
    sourceFormat: "pdf",
    pdfPages: [
      { pageNumber: 2, text: "incident response taxonomy" },
      { pageNumber: 5, text: "budget overview" }
    ]
  });
  assert.equal(pdfSections.length, 2, "PDF indexing should emit one section per page");
  assert.equal(pdfSections[0]?.page_start, 2, "PDF page_start should match source page");
  assert.equal(pdfSections[1]?.page_end, 5, "PDF page_end should match source page");

  const ranked = rerankRagDocumentsByQueryOverlap(
    [
      {
        id: "a",
        sourceType: "document_section",
        sourceId: null,
        chunkIndex: 0,
        score: 0.4,
        textSnippet: "incident response checklist production systems"
      },
      {
        id: "b",
        sourceType: "document_section",
        sourceId: null,
        chunkIndex: 0,
        score: 0.42,
        textSnippet: "unrelated fluff about cats"
      }
    ],
    "incident response production"
  );
  assert.equal(ranked[0]?.id, "a", "Reranker should boost keyword overlap with query");

  console.log("Agent evals passed");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
