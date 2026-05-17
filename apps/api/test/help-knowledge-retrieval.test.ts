import test from "node:test";
import assert from "node:assert/strict";
import { retrieveHelpKnowledgeSections, retrieveRelevantSections } from "../src/services/ragRetrieval.js";
import { createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const orgId = "30000000-0000-0000-0000-000000000001";
const documentId = "30000000-0000-0000-0000-000000000002";

test("retrieveRelevantSections matches query token substring in section body", async () => {
  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "org_document_sections" && operation.action === "select") {
        return {
          data: [
            {
              id: "30000000-0000-0000-0000-000000000010",
              org_id: orgId,
              document_id: documentId,
              section_index: 0,
              page_start: 1,
              page_end: 1,
              heading: "Introduction",
              section_path: "Introduction",
              content: "RERE Global handbook covers values, leave policy, and remote work standards.",
              keyword_terms: ["values", "leave", "policy", "remote", "work"],
              doc_type: "handbook",
              knowledge_scope: [],
              source_format: "md"
            }
          ]
        };
      }
      return { data: null };
    }
  });

  const sections = await retrieveRelevantSections(supabase.client as never, {
    orgId,
    goalInput: "tell me about rere handbook",
    topN: 5
  });

  assert.equal(sections.length, 1);
  assert.match(sections[0]?.content ?? "", /RERE Global/i);
});

test("retrieveHelpKnowledgeSections falls back to file_name match", async () => {
  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "org_document_sections" && operation.action === "select") {
        const loadsByDocument = operation.filters.some(
          (filter) => filter.kind === "in" && filter.column === "document_id"
        );
        if (loadsByDocument) {
          return {
            data: [
              {
                id: "30000000-0000-0000-0000-000000000020",
                org_id: orgId,
                document_id: documentId,
                section_index: 0,
                page_start: 1,
                page_end: 1,
                heading: "Mission",
                section_path: "Mission",
                content: "Our mission is operational excellence.",
                keyword_terms: ["mission", "operational"],
                doc_type: "handbook",
                knowledge_scope: [],
                source_format: "md"
              }
            ]
          };
        }
        return { data: [] };
      }

      if (operation.table === "org_documents" && operation.action === "select") {
        const fileNameLookup = operation.filters.some(
          (filter) => filter.kind === "ilike" && filter.column === "file_name"
        );
        if (fileNameLookup) {
          return {
            data: [{ id: documentId, file_name: "rere_global_handbook.md" }]
          };
        }
      }

      return { data: null };
    }
  });

  const sections = await retrieveHelpKnowledgeSections(
    supabase.client as never,
    orgId,
    "brief rere handbook summary"
  );

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.heading, "Mission");
});
