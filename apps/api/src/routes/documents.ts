/**
 * Documents Routes
 * Company document management and RAG indexing
 */

import crypto from "node:crypto";
import type { FastifyPluginAsync, FastifyRequest } from "fastify";
import { sendApiError } from "../lib/errors.js";
import { DocumentUploadRequestSchema } from "@orgos/shared-types";
import { indexDocument, getOrgDocuments, archiveDocument } from "../services/ragRetrieval.js";
import { decryptText, encryptText } from "../lib/encryption.js";
import { parseLocalFile } from "../services/localFileParser.js";
import { getIngestQueue } from "../queue/index.js";

const MAX_DOCUMENT_CHARS = 200_000;
const MAX_FILENAME_LENGTH = 255;

function sanitizeFileName(input: string): string {
  const trimmed = input.trim();
  const normalized = trimmed.replace(/[^\w.\- ()]/g, "_");
  return normalized.slice(0, MAX_FILENAME_LENGTH);
}

async function readUploadedDocument(
  request: FastifyRequest
): Promise<{
  payload: Record<string, unknown>;
  buffer: Buffer;
} | null> {
  const multipartRequest = request as typeof request & {
    isMultipart?: () => boolean;
    parts?: () => AsyncIterable<{
      type?: string;
      fieldname?: string;
      value?: unknown;
      filename?: string;
      mimetype?: string;
      toBuffer?: () => Promise<Buffer>;
    }>;
  };

  if (typeof multipartRequest.isMultipart === "function" && multipartRequest.isMultipart() && typeof multipartRequest.parts === "function") {
    const fields: Record<string, string[]> = {};
    let fileName = "";
    let mimeType = "";
    let buffer: Buffer | null = null;

    for await (const part of multipartRequest.parts()) {
      if (part.type === "file") {
        fileName = part.filename ?? "";
        mimeType = part.mimetype ?? "";
        buffer = part.toBuffer ? await part.toBuffer() : Buffer.alloc(0);
        continue;
      }

      if (part.fieldname) {
        fields[part.fieldname] = [...(fields[part.fieldname] ?? []), typeof part.value === "string" ? part.value : String(part.value ?? "")];
      }
    }

    if (!buffer || !fileName) {
      return null;
    }

    return {
      payload: {
        org_id: fields.org_id?.[0] ?? "",
        file_name: fileName,
        doc_type: fields.doc_type?.[0] ?? "other",
        summary: fields.summary?.[0],
        branch_id: fields.branch_id?.[0],
        department: fields.department?.[0],
        retrieval_mode: fields.retrieval_mode?.[0],
        knowledge_scope: fields.knowledge_scope ?? (fields.knowledge_scope_csv?.[0]?.split(",").map((value) => value.trim()).filter(Boolean) ?? []),
        mime_type: mimeType
      },
      buffer
    };
  }

  const parsed = DocumentUploadRequestSchema.safeParse((request as { body?: unknown }).body);
  if (!parsed.success) {
    return null;
  }

  const buffer = parsed.data.file_content_base64
    ? Buffer.from(parsed.data.file_content_base64, "base64")
    : Buffer.from(parsed.data.file_content ?? "", "utf8");

  return {
    payload: parsed.data,
    buffer
  };
}

const documentsRoutes: FastifyPluginAsync = async (fastify) => {
  /**
   * POST /documents/upload
   * CEO uploads company document (handbook, policy, structure, etc.)
   * Body: { org_id: string, doc_type?: string }
   * File in multipart form
   */
  fastify.post("/documents/upload", async (request, reply) => {
    if (!request.user || request.userRole !== "ceo") {
      return sendApiError(reply, request, 403, "FORBIDDEN", "Only CEO can upload documents");
    }

    const uploaded = await readUploadedDocument(request);
    if (!uploaded) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid document upload payload", {
        details: "Expected multipart upload or valid JSON document payload"
      });
    }

    const isMultipartPayload =
      typeof (request as { isMultipart?: () => boolean }).isMultipart === "function" &&
      Boolean((request as { isMultipart?: () => boolean }).isMultipart?.());
    const normalizedPayload = DocumentUploadRequestSchema.safeParse({
      ...uploaded.payload,
      ...(isMultipartPayload ? { file_content: "__multipart__" } : {})
    });
    if (!normalizedPayload.success) {
      return sendApiError(reply, request, 400, "VALIDATION_ERROR", "Invalid document upload payload", {
        details: normalizedPayload.error.flatten()
      });
    }

    const orgId = normalizedPayload.data.org_id;
    const docType = normalizedPayload.data.doc_type;
    const fileName = sanitizeFileName(normalizedPayload.data.file_name);

    let parsedFile;
    try {
      parsedFile = await parseLocalFile({
        buffer: uploaded.buffer,
        fileName,
        mimeType: uploaded.payload.mime_type ?? normalizedPayload.data.mime_type ?? null
      });
    } catch (error) {
      return sendApiError(reply, request, 422, "VALIDATION_ERROR", "Document format could not be parsed locally", {
        message: error instanceof Error ? error.message : String(error)
      });
    }

    const extractedText = parsedFile.text.trim();
    const contentHash = crypto.createHash("sha256").update(extractedText).digest("hex");

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
        summary: normalizedPayload.data.summary ?? null,
        branch_id: normalizedPayload.data.branch_id ?? null,
        department: normalizedPayload.data.department ?? null,
        retrieval_mode: normalizedPayload.data.retrieval_mode,
        normalized_content: extractedText,
        knowledge_scope: normalizedPayload.data.knowledge_scope,
        source_format: parsedFile.sourceFormat,
        content_hash: contentHash,
        ingestion_warnings: parsedFile.warnings,
        file_size: uploaded.buffer.length,
        mime_type: uploaded.payload.mime_type ?? normalizedPayload.data.mime_type ?? parsedFile.mimeType,
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

    let indexedSections: Awaited<ReturnType<typeof indexDocument>>["sections"] = [];
    try {
      const indexResult = await indexDocument(fastify.supabaseService, doc.id, extractedText, undefined, {
        orgId,
        branchId: normalizedPayload.data.branch_id ?? null,
        department: normalizedPayload.data.department ?? null,
        docType,
        knowledgeScope: normalizedPayload.data.knowledge_scope,
        sourceFormat: parsedFile.sourceFormat,
        contentHash,
        ingestionWarnings: parsedFile.warnings
      });
      indexedSections = indexResult.sections;
    } catch (e) {
      request.log.warn({ err: e }, "Failed to index document");
    }

    if (normalizedPayload.data.retrieval_mode !== "vectorless" && indexedSections.length > 0) {
      try {
        await getIngestQueue().add("document_ingest", {
          orgId,
          sourceType: "document_section",
          sourceId: doc.id,
          text: extractedText,
          chunks: indexedSections.map((section) => ({
            text: section.content,
            metadata: {
              heading: section.heading,
              sectionPath: section.section_path,
              pageStart: section.page_start,
              pageEnd: section.page_end,
              docType,
              knowledgeScope: normalizedPayload.data.knowledge_scope,
              department: normalizedPayload.data.department ?? null,
              branchId: normalizedPayload.data.branch_id ?? null,
              sourceFormat: parsedFile.sourceFormat,
              fileName,
              contentHash
            }
          }))
        });
      } catch (error) {
        request.log.warn({ err: error }, "Failed to enqueue document embeddings");
      }
    }

    return reply.status(201).send({
      id: doc.id,
      file_name: fileName,
      doc_type: docType,
      source_format: parsedFile.sourceFormat,
      knowledge_scope: normalizedPayload.data.knowledge_scope,
      warnings: parsedFile.warnings,
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
        summary: doc.summary ?? null,
        branch_id: doc.branch_id ?? null,
        department: doc.department ?? null,
        knowledge_scope: doc.knowledge_scope ?? [],
        source_format: doc.source_format ?? "unknown",
        ingestion_warnings: doc.ingestion_warnings ?? [],
        section_count: doc.section_count ?? 0,
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
      summary: doc.summary ?? null,
      key_topics: doc.key_topics,
      page_count: doc.page_count,
      knowledge_scope: doc.knowledge_scope ?? [],
      source_format: doc.source_format ?? "unknown",
      ingestion_warnings: doc.ingestion_warnings ?? [],
      section_count: doc.section_count ?? 0,
      uploaded_at: doc.uploaded_at
    });
  });
};

export default documentsRoutes;
