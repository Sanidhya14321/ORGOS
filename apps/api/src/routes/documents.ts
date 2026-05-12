/**
 * Documents Routes
 * Company document management and RAG indexing
 */

import type { FastifyPluginAsync } from "fastify";
import { sendApiError } from "../lib/errors.js";
import { DocumentUploadRequestSchema } from "@orgos/shared-types";
import { indexDocument, getOrgDocuments, archiveDocument } from "../services/ragRetrieval.js";
import { decryptText, encryptText } from "../lib/encryption.js";

/**
 * Simple plaintext extraction from common formats
 * In production, use pdf-parse, mammoth, etc.
 */
function extractTextFromFile(buffer: Buffer, mimeType: string): string {
  // For now, assume pre-extracted text passed in request
  // Production: parse PDF/Word/etc. and extract text
  return buffer.toString("utf-8");
}

const MAX_DOCUMENT_CHARS = 200_000;
const MAX_FILENAME_LENGTH = 255;

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.replace(/[^\w.\- ()]/g, "_");
  return normalized.slice(0, MAX_FILENAME_LENGTH);
}

const documentsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /documents/upload
   * CEO uploads company document (handbook, policy, structure, etc.)
   * Body: { org_id: string, doc_type?: string }
   * File in multipart form
   */
  fastify.post("/documents/upload", async (request, reply) => {
    // Verify CEO
    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can upload documents");
    }

    const parsed = DocumentUploadRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid document upload payload", {
        details: parsed.error.flatten()
      });
    }

    const orgId = parsed.data.org_id;
    const docType = parsed.data.doc_type;
    const fileName = sanitizeFileName(parsed.data.file_name);
    const extractedText = extractTextFromFile(Buffer.from(parsed.data.file_content, "utf8"), "text/plain").trim();

    if (!fileName) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "A valid file name is required");
    }

    if (extractedText.length === 0) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Document content cannot be empty");
    }

    if (extractedText.length > MAX_DOCUMENT_CHARS) {
      return sendApiError(reply, request, 413, "VALIDATION_ERROR", "Document content exceeds the supported size limit");
    }

    // Verify ownership
    const { data: org, error: orgError } = await fastify.supabaseService
      .from("orgs")
      .select("id")
      .eq("id", orgId)
      .eq("created_by", request.user.id)
      .maybeSingle();

    if (orgError || !org) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    // Store document
    const { data: doc, error: docError } = await fastify.supabaseService
      .from("org_documents")
      .insert({
        org_id: orgId,
        file_name: fileName,
        file_content: encryptText(extractedText),
        doc_type: docType,
        file_size: extractedText.length,
        mime_type: "text/plain",
        is_indexed: false,
        uploaded_by: request.user.id,
        uploaded_at: new Date().toISOString(),
        created_at: new Date().toISOString()
      })
      .select("id")
      .single();

    if (docError || !doc) {
      return sendApiError(reply, request, 500, "INTERNAL_ERROR", `Failed to store document: ${docError?.message}`);
    }

    // Queue indexing job (async)
    try {
      await indexDocument(fastify.supabaseService, doc.id, extractedText);
    } catch (e) {
      request.log.warn({ err: e }, "Failed to index document");
    }

    return reply.status(201).send({
      id: doc.id,
      file_name: fileName,
      doc_type: docType,
      uploaded_at: new Date().toISOString()
    });
  });

  /**
   * GET /documents/org/:org_id
   * List all documents for organization
   */
  fastify.get("/documents/org/:org_id", async (request, reply) => {
    const { org_id } = request.params as { org_id: string };

    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    // Check if user belongs to org
    const { data: user, error: userError } = await fastify.supabaseService
      .from("users")
      .select("org_id, role")
      .eq("id", request.user.id)
      .eq("org_id", org_id)
      .maybeSingle();

    if (userError || !user) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "You do not have access to this organization");
    }

    const documents = await getOrgDocuments(fastify.supabaseService, org_id);

    return reply.send({
      documents: documents.map((doc) => ({
        id: doc.id,
        file_name: doc.file_name,
        doc_type: doc.doc_type,
        file_size: doc.file_size,
        page_count: doc.page_count || 0,
        key_topics: doc.key_topics || [],
        is_indexed: doc.is_indexed,
        uploaded_at: doc.uploaded_at,
        indexed_at: doc.indexed_at
      }))
    });
  });

  /**
   * DELETE /documents/:id
   * CEO archives a document (soft delete)
   */
  fastify.delete("/documents/:id", async (request, reply) => {
    const { id } = request.params as { id: string };
    const bodyData = request.body as { org_id?: string };
    const orgId = bodyData?.org_id;

    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can delete documents");
    }

    if (!orgId) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "org_id required");
    }

    // Verify ownership
    const { data: org, error: orgError } = await fastify.supabaseService
      .from("orgs")
      .select("id")
      .eq("id", orgId)
      .eq("created_by", request.user.id)
      .maybeSingle();

    if (orgError || !org) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    await archiveDocument(fastify.supabaseService, orgId, id);

    return reply.status(204).send();
  });

  /**
   * GET /documents/:id/content
   * Get full document content (for CEO review)
   */
  fastify.get("/documents/:id/content", async (request, reply) => {
    const { id } = request.params as { id: string };

    if (!request.user) {
      return sendApiError(reply, request, 401, "UNAUTHORIZED", "Missing user context");
    }

    // Get document
    const { data: doc, error: docError } = await fastify.supabaseService
      .from("org_documents")
      .select("*")
      .eq("id", id)
      .is("archived_at", null)
      .maybeSingle();

    if (docError || !doc) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Document not found");
    }

    // Check org access
    const { data: user, error: userError } = await fastify.supabaseService
      .from("users")
      .select("id")
      .eq("id", request.user.id)
      .eq("org_id", doc.org_id)
      .maybeSingle();

    if (userError || !user) {
      return sendApiError(reply, request, 403, "FORBIDDEN", "You do not have access to this document");
    }

    return reply.send({
      id: doc.id,
      file_name: doc.file_name,
      doc_type: doc.doc_type,
      file_content: decryptText(doc.file_content) ?? "",
      key_topics: doc.key_topics,
      page_count: doc.page_count,
      uploaded_at: doc.uploaded_at
    });
  });
};

export default documentsRoutes;
