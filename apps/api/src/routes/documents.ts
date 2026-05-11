/**
 * Documents Routes
 * Company document management and RAG indexing
 */

import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import { sendApiError } from "../lib/errors.js";
import { DocumentUploadRequestSchema, DocumentListResponseSchema } from "@orgos/shared-types";
import { indexDocument, getOrgDocuments, archiveDocument } from "../services/ragRetrieval.js";

/**
 * Simple plaintext extraction from common formats
 * In production, use pdf-parse, mammoth, etc.
 */
function extractTextFromFile(buffer: Buffer, mimeType: string): string {
  // For now, assume pre-extracted text passed in request
  // Production: parse PDF/Word/etc. and extract text
  return buffer.toString("utf-8");
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

    // Get org_id and doc_type from body
    const bodyData = request.body as { org_id?: string; doc_type?: string };
    const orgId = bodyData?.org_id;
    const docType = bodyData?.doc_type || "other";

    if (!orgId) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "org_id required in body");
    }

    const validTypes = ["handbook", "policy", "structure", "financial", "process", "other"];
    if (!validTypes.includes(docType)) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid doc_type");
    }

    // Verify ownership
    const { data: org, error: orgError } = await fastify.supabaseService
      .from("organizations")
      .select("id")
      .eq("id", orgId)
      .eq("created_by", request.user.id)
      .maybeSingle();

    if (orgError || !org) {
      return sendApiError(reply, request, 404, "NOT_FOUND", "Organization not found");
    }

    // For multipart file handling, we'll assume the file content is passed as a string in the body
    // In production, integrate with @fastify/multipart for true file uploads
    const { fileContent, fileName, mimeType } = bodyData as {
      fileContent?: string;
      fileName?: string;
      mimeType?: string;
    };

    if (!fileContent || !fileName) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "fileContent and fileName required");
    }

    // Store document
    const { data: doc, error: docError } = await fastify.supabaseService
      .from("org_documents")
      .insert({
        org_id: orgId,
        file_name: fileName,
        file_content: fileContent,
        doc_type: docType,
        file_size: fileContent.length,
        mime_type: mimeType || "text/plain",
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
      await indexDocument(fastify.supabaseService, doc.id, fileContent);
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
      .from("organizations")
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
      file_content: doc.file_content,
      key_topics: doc.key_topics,
      page_count: doc.page_count,
      uploaded_at: doc.uploaded_at
    });
  });
};

export default documentsRoutes;
