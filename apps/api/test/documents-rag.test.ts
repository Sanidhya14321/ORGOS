import test from "node:test";
import assert from "node:assert/strict";
import documentsRoutes from "../src/routes/documents.js";
import { buildRouteTestApp, createSupabaseMock, type QueryOperation } from "./helpers/mockBackend.js";

const ownerId = "10000000-0000-0000-0000-000000000001";
const orgId = "10000000-0000-0000-0000-000000000002";
const documentId = "10000000-0000-0000-0000-000000000003";

function createDocumentsResolver() {
  return async (operation: QueryOperation) => {
    if (operation.table === "orgs" && operation.action === "select") {
      return { data: { id: orgId } };
    }

    if (operation.table === "org_documents" && operation.action === "insert") {
      return { data: { id: documentId } };
    }

    if (operation.table === "org_documents" && operation.action === "update") {
      return { data: { id: documentId } };
    }

    if (operation.table === "org_document_sections" && operation.action === "delete") {
      return { data: null };
    }

    if (operation.table === "org_document_sections" && operation.action === "insert") {
      return { data: [{ id: "10000000-0000-0000-0000-000000000010" }] };
    }

    return { data: null };
  };
}

test("document upload parses local text and stores RAG metadata", async () => {
  const supabase = createSupabaseMock({
    resolve: createDocumentsResolver()
  });

  const app = await buildRouteTestApp({
    routes: documentsRoutes,
    supabaseService: supabase.client,
    currentUser: {
      id: ownerId,
      role: "ceo",
      email: "owner@orgos.test"
    }
  });

  const response = await app.inject({
    method: "POST",
    url: "/documents/upload",
    payload: {
      org_id: orgId,
      file_name: "engineering-runbook.txt",
      file_content: [
        "Runbook",
        "",
        "Incident response checklist",
        "",
        "Escalate Sev1 issues to Engineering Manager"
      ].join("\n"),
      doc_type: "process",
      department: "Engineering",
      retrieval_mode: "vectorless",
      knowledge_scope: ["runbook", "department_playbook"]
    }
  });

  assert.equal(response.statusCode, 201);

  const documentInsert = supabase.operations.find(
    (operation) => operation.table === "org_documents" && operation.action === "insert"
  );
  assert.ok(documentInsert);
  assert.equal((documentInsert.values as { source_format: string }).source_format, "txt");
  assert.deepEqual((documentInsert.values as { knowledge_scope: string[] }).knowledge_scope, ["runbook", "department_playbook"]);

  const sectionInsert = supabase.operations.find(
    (operation) => operation.table === "org_document_sections" && operation.action === "insert"
  );
  assert.ok(sectionInsert);

  await app.close();
});

test("document upload hybrid without OPENAI_API_KEY stores vectorless and reports no embedding enqueue", async () => {
  const prevKey = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  try {
    const supabase = createSupabaseMock({
      resolve: createDocumentsResolver()
    });

    const app = await buildRouteTestApp({
      routes: documentsRoutes,
      supabaseService: supabase.client,
      currentUser: {
        id: ownerId,
        role: "ceo",
        email: "owner@orgos.test"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/documents/upload",
      payload: {
        org_id: orgId,
        file_name: "policy-fallback.txt",
        file_content: "Remote work policy requires VPN for production access.",
        doc_type: "policy",
        retrieval_mode: "hybrid",
        knowledge_scope: ["policy"]
      }
    });

    assert.equal(response.statusCode, 201, response.body);
    const body = JSON.parse(response.body) as {
      retrieval_mode_requested: string;
      retrieval_mode_stored: string;
      embedding_enqueued: boolean;
    };
    assert.equal(body.retrieval_mode_requested, "hybrid");
    assert.equal(body.retrieval_mode_stored, "vectorless");
    assert.equal(body.embedding_enqueued, false);

    const documentInsert = supabase.operations.find(
      (operation) => operation.table === "org_documents" && operation.action === "insert"
    );
    assert.ok(documentInsert);
    assert.equal((documentInsert.values as { retrieval_mode: string }).retrieval_mode, "vectorless");

    await app.close();
  } finally {
    if (prevKey !== undefined) {
      process.env.OPENAI_API_KEY = prevKey;
    }
  }
});
