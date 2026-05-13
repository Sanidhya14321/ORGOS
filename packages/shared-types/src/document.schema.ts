import { z } from "zod";

/**
 * Company Document Schema
 * Stores documents uploaded by CEO for RAG context injection
 * Used when generating task decompositions, routing suggestions, etc.
 */
export const DocumentTypeSchema = z.enum([
  "handbook",       // Employee handbook
  "policy",         // Company policy
  "structure",      // Org structure doc
  "financial",      // Financial info
  "process",        // Process documentation
  "other"
]);

export const DocumentKnowledgeScopeSchema = z.enum([
  "company",
  "product",
  "architecture",
  "sop",
  "department_playbook",
  "policy",
  "project_brief",
  "runbook",
  "org_structure",
  "other"
]);

export const DocumentSourceFormatSchema = z.enum([
  "pdf",
  "docx",
  "xlsx",
  "csv",
  "txt",
  "md",
  "unknown"
]);

export const OrgDocumentSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  department: z.string().nullable().optional(),
  
  // File info
  file_name: z.string().min(1).max(255),
  file_size: z.number().int().positive(),
  mime_type: z.string(),
  
  // Content
  file_content: z.string(), // Raw text (post-OCR if PDF)
  summary: z.string().optional(), // User-provided or AI-generated summary
  doc_type: DocumentTypeSchema,
  normalized_content: z.string().optional(),
  retrieval_mode: z.enum(["vectorless", "vector", "hybrid"]).default("vectorless"),
  knowledge_scope: z.array(DocumentKnowledgeScopeSchema).default([]),
  source_format: DocumentSourceFormatSchema.default("unknown"),
  content_hash: z.string().optional(),
  ingestion_warnings: z.array(z.string()).default([]),
  
  // RAG indexing
  is_indexed: z.boolean().default(false),
  indexed_at: z.string().datetime().nullable().optional(),
  page_count: z.number().int().nonnegative().optional(),
  key_topics: z.array(z.string()).optional(), // Auto-extracted or user-provided
  section_count: z.number().int().nonnegative().optional(),
  
  // Metadata
  uploaded_by: z.string().uuid(),
  uploaded_at: z.string().datetime(),
  updated_at: z.string().datetime().optional(),
  archived_at: z.string().datetime().nullable().optional(),
});

export type OrgDocument = z.infer<typeof OrgDocumentSchema>;

/**
 * Document Upload Request
 */
export const DocumentUploadRequestSchema = z.object({
  org_id: z.string().uuid(),
  file_name: z.string().min(1).max(255),
  file_content: z.string().optional(), // Raw text fallback
  file_content_base64: z.string().optional(),
  mime_type: z.string().optional(),
  doc_type: DocumentTypeSchema,
  summary: z.string().optional(),
  branch_id: z.string().uuid().optional(),
  department: z.string().max(120).optional(),
  retrieval_mode: z.enum(["vectorless", "vector", "hybrid"]).default("vectorless"),
  knowledge_scope: z.array(DocumentKnowledgeScopeSchema).default([])
}).superRefine((value, ctx) => {
  if (!value.file_content && !value.file_content_base64) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: "Either file_content or file_content_base64 is required",
      path: ["file_content"]
    });
  }
});

export const OrgDocumentSectionSchema = z.object({
  id: z.string().uuid(),
  org_id: z.string().uuid(),
  document_id: z.string().uuid(),
  branch_id: z.string().uuid().nullable().optional(),
  department: z.string().nullable().optional(),
  section_index: z.number().int().nonnegative(),
  page_start: z.number().int().positive().nullable().optional(),
  page_end: z.number().int().positive().nullable().optional(),
  heading: z.string().nullable().optional(),
  section_path: z.string().nullable().optional(),
  content: z.string(),
  keyword_terms: z.array(z.string()).default([]),
  doc_type: DocumentTypeSchema.optional(),
  knowledge_scope: z.array(DocumentKnowledgeScopeSchema).default([]),
  source_format: DocumentSourceFormatSchema.default("unknown"),
  created_at: z.string().datetime().optional()
});

export type OrgDocumentSection = z.infer<typeof OrgDocumentSectionSchema>;

/**
 * Document List Response
 */
export const DocumentListResponseSchema = z.object({
  items: z.array(OrgDocumentSchema),
  total: z.number().int().nonnegative(),
  page: z.number().int().positive(),
  limit: z.number().int().positive(),
});

/**
 * RAG Context Injection (for LLM calls)
 * When generating goals/tasks, include relevant documents in LLM context
 */
export const RAGContextSchema = z.object({
  goal_input: z.string(),
  relevant_documents: z.array(
    z.object({
      doc_type: DocumentTypeSchema,
      summary: z.string(),
      key_topics: z.array(z.string()).optional(),
      excerpt: z.string().max(2000), // Truncated content
      section_index: z.number().int().nonnegative().optional(),
    })
  ),
  context_instruction: z.string(), // e.g., "Use the company handbook to understand our values"
});
