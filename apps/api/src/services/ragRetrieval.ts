/**
 * RAG Retrieval Service (Vectorless)
 * Retrieves relevant company documents for goal decomposition
 * Uses keyword matching + page-based indexing (no vector embeddings)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { OrgDocument, type OrgDocumentSection, RAGContextSchema } from "@orgos/shared-types";
import { decryptText } from "../lib/encryption.js";

export interface RagFilterOptions {
  branchId?: string | null;
  department?: string | null;
  docTypes?: string[];
  knowledgeScopes?: string[];
  sourceFormats?: string[];
}

export interface IndexedDocumentSection {
  section_index: number;
  heading: string | null;
  section_path: string | null;
  content: string;
  page_start: number;
  page_end: number;
  keyword_terms: string[];
}

export interface PdfPageSlice {
  pageNumber: number;
  text: string;
}

/**
 * Build section rows for org_document_sections.
 * PDF: one section per non-empty page with accurate page_start/page_end.
 * Other formats: paragraph-based sections with heuristic page span.
 */
export function buildDocumentSectionsForIndexing(
  normalizedFullText: string,
  options?: { pdfPages?: PdfPageSlice[]; sourceFormat?: string }
): IndexedDocumentSection[] {
  const format = options?.sourceFormat;
  const rawPages = options?.pdfPages?.filter((p) => p.pageNumber > 0) ?? [];
  const pages = rawPages.filter((p) => normalizeContent(p.text).length > 0);

  if (format === "pdf" && pages.length > 0) {
    return pages.map((page, idx) => {
      const content = normalizeContent(page.text);
      const pn = page.pageNumber;
      return {
        section_index: idx,
        heading: `Page ${pn}`,
        section_path: `page:${pn}`,
        content,
        page_start: pn,
        page_end: pn,
        keyword_terms: Array.from(extractKeywords(page.text)).slice(0, 20)
      };
    });
  }

  return splitIntoSections(normalizedFullText);
}

/**
 * Extract keywords from a goal/task input
 * Simple word frequency + stop-word filtering
 */
function extractKeywords(text: string): Set<string> {
  const stopwords = new Set([
    "the", "a", "an", "and", "or", "but", "in", "on", "at", "to", "for",
    "of", "with", "is", "are", "was", "were", "be", "have", "has", "had",
    "do", "does", "did", "will", "would", "could", "should", "may", "might",
    "can", "must", "should", "we", "you", "they", "it", "that", "this",
    "from", "by", "as", "if", "what", "when", "where", "why", "how"
  ]);

  const words = text
    .toLowerCase()
    .replace(/[^a-z0-9\s]/g, "")
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.has(word));

  return new Set(words);
}

function normalizeContent(text: string): string {
  const normalized = text
    .replace(/\r\n/g, "\n")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

  const lines = normalized.split("\n");
  const seen = new Map<string, number>();
  const filtered = lines.filter((line) => {
    const key = line.trim().toLowerCase();
    if (key.length < 4 || key.length > 120) {
      return true;
    }
    const count = (seen.get(key) ?? 0) + 1;
    seen.set(key, count);
    return count <= 2;
  });

  return filtered.join("\n").trim();
}

function isHeadingLike(block: string): boolean {
  const trimmed = block.trim();
  if (!trimmed || trimmed.length > 140) {
    return false;
  }
  return (
    /^#{1,6}\s+/.test(trimmed) ||
    /^sheet:\s+/i.test(trimmed) ||
    /^section\s+\d+/i.test(trimmed) ||
    /^[A-Z][A-Z0-9 /&().:-]{3,}$/.test(trimmed)
  );
}

function splitIntoSections(text: string): IndexedDocumentSection[] {
  const normalized = normalizeContent(text);
  if (!normalized) {
    return [];
  }

  const paragraphChunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const sections: IndexedDocumentSection[] = [];

  let buffer: string[] = [];
  let sectionIndex = 0;
  let currentHeading: string | null = null;

  function flushBuffer() {
    if (buffer.length === 0) {
      return;
    }
    const content = buffer.join("\n\n").trim();
    if (!content) {
      buffer = [];
      return;
    }
    const keywordTerms = Array.from(extractKeywords(content)).slice(0, 20);
    const pageStart = sectionIndex + 1;
    const approxPages = Math.max(1, Math.ceil(content.length / 3000));
    sections.push({
      section_index: sectionIndex,
      heading: currentHeading,
      section_path: currentHeading,
      content,
      page_start: pageStart,
      page_end: pageStart + approxPages - 1,
      keyword_terms: keywordTerms
    });
    buffer = [];
    sectionIndex += 1;
  }

  for (const chunk of paragraphChunks) {
    if (isHeadingLike(chunk)) {
      flushBuffer();
      currentHeading = chunk.replace(/^#{1,6}\s+/, "").trim();
      continue;
    }
    buffer.push(chunk);
    if (chunk.includes("|") && buffer.join("\n\n").length < 2200) {
      continue;
    }
    if (buffer.join("\n\n").length >= 1600) {
      flushBuffer();
    }
  }
  flushBuffer();

  return sections;
}

/**
 * Calculate similarity score between input keywords and document keywords
 * Uses Jaccard similarity (intersection / union)
 */
function calculateSimilarity(inputKeywords: Set<string>, docKeywords: Set<string>): number {
  if (docKeywords.size === 0 || inputKeywords.size === 0) return 0;

  const intersection = new Set([...inputKeywords].filter((x) => docKeywords.has(x)));
  const union = new Set([...inputKeywords, ...docKeywords]);

  return intersection.size / union.size;
}

/**
 * Retrieve relevant documents for a goal/task
 * Returns top-N documents matching input keywords
 */
export async function retrieveRelevantDocuments(
  supabase: SupabaseClient,
  orgId: string,
  goalInput: string,
  topN: number = 3,
  similarityThreshold: number = 0.15
): Promise<OrgDocument[]> {
  // Fetch all documents for the org
  const { data: documents, error } = await supabase
    .from("org_documents")
    .select("*")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) {
    console.warn(`Failed to fetch documents: ${error.message}`);
    return [];
  }

  if (!documents || documents.length === 0) {
    return [];
  }

  const hydratedDocuments = documents.map((doc) => ({
    ...doc,
    file_content: decryptText(doc.file_content) ?? ""
  })) as OrgDocument[];

  // Extract keywords from goal input
  const inputKeywords = extractKeywords(goalInput);

  // Score all documents
  const scored = hydratedDocuments.map((doc) => {
    const docTopics = (doc.key_topics as string[]) || [];
    const docKeywords = new Set(
      docTopics.flatMap((t: string) => Array.from(extractKeywords(t)))
    );
    const similarity = calculateSimilarity(inputKeywords, docKeywords);
    return {
      doc: doc as OrgDocument,
      score: similarity
    };
  });

  // Filter by threshold and sort
  return scored
    .filter(({ score }) => score >= similarityThreshold)
    .sort((a, b) => b.score - a.score)
    .slice(0, topN)
    .map(({ doc }) => doc);
}

async function retrieveRelevantSectionsLexical(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    goalInput: string;
    topN?: number;
    similarityThreshold?: number;
    branchId?: string | null;
    department?: string | null;
    docTypes?: string[];
    knowledgeScopes?: string[];
    sourceFormats?: string[];
  }
): Promise<OrgDocumentSection[]> {
  const topN = params.topN ?? 5;
  const similarityThreshold = params.similarityThreshold ?? 0.12;
  const inputKeywords = extractKeywords(params.goalInput);

  let query = supabase
    .from("org_document_sections")
    .select("*")
    .eq("org_id", params.orgId);

  if (params.branchId) {
    query = query.eq("branch_id", params.branchId);
  }
  if (params.department) {
    query = query.eq("department", params.department);
  }
  if (params.docTypes && params.docTypes.length > 0) {
    query = query.in("doc_type", params.docTypes);
  }
  if (params.sourceFormats && params.sourceFormats.length > 0) {
    query = query.in("source_format", params.sourceFormats);
  }

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  if (process.env.ORGOS_RAG_RETRIEVAL_LOG === "1") {
    console.info("[rag_retrieval]", {
      mode: "lexical",
      orgId: params.orgId,
      queryKeywords: Array.from(inputKeywords),
      rawSectionRows: data.length,
      topN
    });
  }

  const scored = (data as OrgDocumentSection[])
    .map((section) => ({
      section,
      score: calculateSimilarity(inputKeywords, new Set(section.keyword_terms ?? []))
        + (
          params.knowledgeScopes && params.knowledgeScopes.length > 0
            ? params.knowledgeScopes.some((scope) => (section.knowledge_scope ?? []).map(String).includes(scope))
              ? 0.08
              : 0
            : 0
        )
    }))
    .filter(({ section }) => {
      if (!params.knowledgeScopes || params.knowledgeScopes.length === 0) {
        return true;
      }
      const scopes = section.knowledge_scope ?? [];
      return scopes.length === 0 || scopes.some((scope) => params.knowledgeScopes?.includes(scope));
    })
    .filter(({ score }) => score >= similarityThreshold)
    .sort((left, right) => right.score - left.score);

  if (process.env.ORGOS_RAG_RETRIEVAL_LOG === "1") {
    console.info("[rag_retrieval]", {
      mode: "lexical",
      orgId: params.orgId,
      afterFilter: scored.length,
      topScores: scored.slice(0, 3).map((row) => ({
        section_index: row.section.section_index,
        score: row.score
      }))
    });
  }

  return scored.slice(0, topN).map(({ section }) => section);
}

export async function retrieveRelevantSections(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    goalInput: string;
    topN?: number;
    similarityThreshold?: number;
    branchId?: string | null;
    department?: string | null;
    docTypes?: string[];
    knowledgeScopes?: string[];
    sourceFormats?: string[];
  }
): Promise<OrgDocumentSection[]> {
  const topN = params.topN ?? 5;

  if (process.env.ORGOS_SECTION_TSVECTOR === "1") {
    try {
      const rpcArgs: Record<string, unknown> = {
        p_org_id: params.orgId,
        p_query: params.goalInput.trim(),
        p_match_count: Math.max(topN * 4, 20),
        p_branch_id: params.branchId ?? null,
        p_department: params.department ?? null,
        p_doc_types: params.docTypes && params.docTypes.length > 0 ? params.docTypes : null,
        p_knowledge_scopes: params.knowledgeScopes && params.knowledgeScopes.length > 0 ? params.knowledgeScopes : null,
        p_source_formats: params.sourceFormats && params.sourceFormats.length > 0 ? params.sourceFormats : null
      };

      const { data, error } = await supabase.rpc("match_org_document_sections_tsvector", rpcArgs);

      if (!error && Array.isArray(data) && data.length > 0) {
        const sections = data as OrgDocumentSection[];
        if (process.env.ORGOS_RAG_RETRIEVAL_LOG === "1") {
          console.info("[rag_retrieval]", {
            mode: "tsvector",
            orgId: params.orgId,
            rowCount: sections.length
          });
        }
        return sections.slice(0, topN);
      }
    } catch (err) {
      console.warn("match_org_document_sections_tsvector failed; falling back to lexical", err);
    }
  }

  return retrieveRelevantSectionsLexical(supabase, params);
}

/**
 * Build RAG context for LLM prompt injection
 * Concatenates relevant documents into instruction text
 */
export function buildRAGContext(
  goalInput: string,
  relevantDocs: Array<OrgDocument | OrgDocumentSection>
): {
  contextInstruction: string;
  docContexts: string[];
} {
  const docContexts: string[] = [];
  let contextInstruction = "";

  if (relevantDocs.length > 0) {
    contextInstruction = `Use the following company information to inform your decomposition:\n`;

    for (const doc of relevantDocs) {
      if ("file_content" in doc) {
        const excerpt = doc.file_content.substring(0, 1500);
        docContexts.push(`[${doc.doc_type.toUpperCase()}: ${doc.file_name}]\n${excerpt}\n`);
      } else {
        const excerpt = doc.content.substring(0, 1500);
        const pageHint =
          doc.page_start != null && doc.page_end != null
            ? ` pp.${doc.page_start}-${doc.page_end}`
            : "";
        docContexts.push(
          `[SECTION ${doc.section_index + 1}${doc.heading ? `: ${doc.heading}` : ""}${pageHint}]\n${excerpt}\n`
        );
      }
    }

    contextInstruction += docContexts.join("\n---\n");
  }

  return { contextInstruction, docContexts };
}

/**
 * Index document (extract keywords + summary)
 * Called after document upload
 */
export async function indexDocument(
  supabase: SupabaseClient,
  documentId: string,
  fileContent: string,
  userProvidedTopics?: string[],
  options?: {
    orgId?: string;
    branchId?: string | null;
    department?: string | null;
    docType?: string;
    knowledgeScope?: string[];
    sourceFormat?: string;
    contentHash?: string;
    ingestionWarnings?: string[];
    pdfPages?: PdfPageSlice[];
    pdfTotalPages?: number;
  }
): Promise<{
  normalizedContent: string;
  topics: string[];
  pageCount: number;
  sections: IndexedDocumentSection[];
}> {
  // Extract topics from content if not provided
  let topics = userProvidedTopics || [];
  if (topics.length === 0) {
    const contentKeywords = extractKeywords(fileContent);
    topics = Array.from(contentKeywords).slice(0, 10);
  }

  const normalizedContent = normalizeContent(fileContent);
  const sections = buildDocumentSectionsForIndexing(normalizedContent, {
    ...(options?.pdfPages && options.pdfPages.length > 0 ? { pdfPages: options.pdfPages } : {}),
    ...(options?.sourceFormat ? { sourceFormat: options.sourceFormat } : {})
  });

  const pageCount =
    options?.pdfTotalPages && options.pdfTotalPages > 0
      ? options.pdfTotalPages
      : sections.length > 0
        ? Math.max(...sections.map((s) => s.page_end))
        : Math.max(1, Math.ceil(fileContent.length / 3000));

  const { error } = await supabase
    .from("org_documents")
    .update({
      is_indexed: true,
      indexed_at: new Date().toISOString(),
      page_count: pageCount,
      key_topics: topics,
      normalized_content: normalizedContent,
      section_count: sections.length,
      doc_type: options?.docType,
      knowledge_scope: options?.knowledgeScope ?? [],
      source_format: options?.sourceFormat ?? "unknown",
      content_hash: options?.contentHash,
      ingestion_warnings: options?.ingestionWarnings ?? []
    })
    .eq("id", documentId);

  if (error) {
    console.warn(`Failed to index document: ${error.message}`);
    return { normalizedContent, topics, pageCount, sections };
  }

  if (!options?.orgId) {
    return { normalizedContent, topics, pageCount, sections };
  }

  await supabase.from("org_document_sections").delete().eq("document_id", documentId);
  if (sections.length === 0) {
    return { normalizedContent, topics, pageCount, sections };
  }

  const insertResult = await supabase.from("org_document_sections").insert(
    sections.map((section) => ({
      org_id: options.orgId,
      document_id: documentId,
      branch_id: options.branchId ?? null,
      department: options.department ?? null,
      section_index: section.section_index,
      page_start: section.page_start,
      page_end: section.page_end,
      heading: section.heading,
      section_path: section.section_path,
      content: section.content,
      keyword_terms: section.keyword_terms,
      doc_type: options.docType ?? "other",
      knowledge_scope: options.knowledgeScope ?? [],
      source_format: options.sourceFormat ?? "unknown"
    }))
  );

  if (insertResult.error) {
    console.warn(`Failed to index document sections: ${insertResult.error.message}`);
  }

  return { normalizedContent, topics, pageCount, sections };
}

/**
 * Get all documents for an organization (for admin/display)
 */
export async function getOrgDocuments(
  supabase: SupabaseClient,
  orgId: string
): Promise<OrgDocument[]> {
  const { data, error } = await supabase
    .from("org_documents")
    .select("*")
    .eq("org_id", orgId)
    .is("archived_at", null)
    .order("uploaded_at", { ascending: false });

  if (error) {
    throw new Error(`Failed to fetch documents: ${error.message}`);
  }

  return ((data || []) as OrgDocument[]).map((doc) => ({
    ...doc,
    file_content: decryptText(doc.file_content) ?? ""
  }));
}

/**
 * Archive a document (soft delete)
 */
export async function archiveDocument(
  supabase: SupabaseClient,
  orgId: string,
  documentId: string
): Promise<void> {
  const { error } = await supabase
    .from("org_documents")
    .update({ archived_at: new Date().toISOString() })
    .eq("id", documentId)
    .eq("org_id", orgId);

  if (error) {
    throw new Error(`Failed to archive document: ${error.message}`);
  }
}
