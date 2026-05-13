import test from "node:test";
import assert from "node:assert/strict";
import { retrieveRelevantSections } from "../src/services/ragRetrieval.js";
import { createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const orgId = "30000000-0000-0000-0000-000000000001";
const documentId = "30000000-0000-0000-0000-000000000002";

const tsvectorRow = {
  id: "30000000-0000-0000-0000-000000000010",
  org_id: orgId,
  document_id: documentId,
  branch_id: null,
  department: "Engineering",
  section_index: 0,
  page_start: 1,
  page_end: 1,
  heading: "FTS hit",
  section_path: "fts",
  content: "incident response checklist for production",
  keyword_terms: ["incident", "response"],
  doc_type: "process",
  knowledge_scope: ["runbook"],
  source_format: "txt",
  created_at: new Date().toISOString()
};

test("retrieveRelevantSections uses tsvector RPC when ORGOS_SECTION_TSVECTOR=1 and RPC returns rows", async () => {
  const prev = process.env.ORGOS_SECTION_TSVECTOR;
  const prevRag = process.env.ORGOS_RAG_RETRIEVAL_LOG;
  process.env.ORGOS_SECTION_TSVECTOR = "1";
  process.env.ORGOS_RAG_RETRIEVAL_LOG = "0";

  try {
    const supabase = createSupabaseMock({
      resolve: async (operation: QueryOperation) => {
        if (operation.table === "org_document_sections" && operation.action === "select") {
          throw new Error("lexical path should not run when tsvector returns data");
        }
        return { data: null };
      },
      rpcResolver: async (fn) => {
        assert.equal(fn, "match_org_document_sections_tsvector");
        return { data: [tsvectorRow], error: null };
      }
    });

    const sections = await retrieveRelevantSections(supabase.client as never, {
      orgId,
      goalInput: "incident response checklist",
      topN: 3
    });

    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.heading, "FTS hit");
  } finally {
    if (prev === undefined) {
      delete process.env.ORGOS_SECTION_TSVECTOR;
    } else {
      process.env.ORGOS_SECTION_TSVECTOR = prev;
    }
    if (prevRag === undefined) {
      delete process.env.ORGOS_RAG_RETRIEVAL_LOG;
    } else {
      process.env.ORGOS_RAG_RETRIEVAL_LOG = prevRag;
    }
  }
});

test("retrieveRelevantSections falls back to lexical when tsvector RPC returns empty", async () => {
  const prev = process.env.ORGOS_SECTION_TSVECTOR;
  process.env.ORGOS_SECTION_TSVECTOR = "1";

  try {
    const supabase = createSupabaseMock({
      resolve: async (operation: QueryOperation) => {
        if (operation.table === "org_document_sections" && operation.action === "select") {
          return {
            data: [
              {
                id: "30000000-0000-0000-0000-000000000011",
                org_id: orgId,
                document_id: documentId,
                branch_id: null,
                department: "Engineering",
                section_index: 0,
                page_start: 1,
                page_end: 1,
                heading: "Lexical hit",
                section_path: "lex",
                content: "incident response checklist for production systems",
                keyword_terms: ["incident", "response", "production", "systems"],
                doc_type: "process",
                knowledge_scope: ["runbook"],
                source_format: "txt"
              }
            ]
          };
        }
        return { data: null };
      },
      rpcResolver: async () => ({ data: [], error: null })
    });

    const sections = await retrieveRelevantSections(supabase.client as never, {
      orgId,
      goalInput: "incident response checklist",
      topN: 5,
      department: "Engineering",
      knowledgeScopes: ["runbook"]
    });

    assert.equal(sections.length, 1);
    assert.equal(sections[0]?.heading, "Lexical hit");
  } finally {
    if (prev === undefined) {
      delete process.env.ORGOS_SECTION_TSVECTOR;
    } else {
      process.env.ORGOS_SECTION_TSVECTOR = prev;
    }
  }
});
