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
  const { buildRAGContext } = await loadBuiltModule("apps/api/dist/services/ragRetrieval.js");

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

  console.log("Agent evals passed");
}

run().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
