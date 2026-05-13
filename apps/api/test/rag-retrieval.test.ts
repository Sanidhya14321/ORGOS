import test from "node:test";
import assert from "node:assert/strict";
import { retrieveRelevantSections } from "../src/services/ragRetrieval.js";
import { createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const orgId = "20000000-0000-0000-0000-000000000001";
const documentId = "20000000-0000-0000-0000-000000000002";

test("retrieveRelevantSections narrows results by department and knowledge scope", async () => {
  const supabase = createSupabaseMock({
    resolve: async (operation: QueryOperation) => {
      if (operation.table === "org_document_sections" && operation.action === "select") {
        return {
          data: [
            {
              id: "20000000-0000-0000-0000-000000000010",
              org_id: orgId,
              document_id: documentId,
              branch_id: null,
              department: "Engineering",
              section_index: 0,
              page_start: 1,
              page_end: 1,
              heading: "Incident Response",
              section_path: "Runbook > Incident Response",
              content: "Incident response checklist for production systems",
              keyword_terms: ["incident", "response", "production", "systems"],
              doc_type: "process",
              knowledge_scope: ["runbook", "department_playbook"],
              source_format: "txt"
            },
            {
              id: "20000000-0000-0000-0000-000000000011",
              org_id: orgId,
              document_id: documentId,
              branch_id: null,
              department: "Finance",
              section_index: 1,
              page_start: 2,
              page_end: 2,
              heading: "Budget Review",
              section_path: "Finance > Budget Review",
              content: "Quarterly budget review process",
              keyword_terms: ["budget", "review", "finance"],
              doc_type: "process",
              knowledge_scope: ["department_playbook"],
              source_format: "txt"
            }
          ]
        };
      }

      return { data: null };
    }
  });

  const sections = await retrieveRelevantSections(supabase.client as never, {
    orgId,
    goalInput: "incident response checklist",
    topN: 5,
    department: "Engineering",
    knowledgeScopes: ["runbook"]
  });

  assert.equal(sections.length, 1);
  assert.equal(sections[0]?.heading, "Incident Response");
});
