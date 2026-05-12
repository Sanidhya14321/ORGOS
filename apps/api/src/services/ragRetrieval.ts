/**
 * RAG Retrieval Service (Vectorless)
 * Retrieves relevant company documents for goal decomposition
 * Uses keyword matching + page-based indexing (no vector embeddings)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { OrgDocument, type OrgDocumentSection, RAGContextSchema } from "@orgos/shared-types";
import { decryptText } from "../lib/encryption.js";

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
  return text.replace(/\r\n/g, "\n").replace(/\n{3,}/g, "\n\n").trim();
}

function splitIntoSections(text: string): Array<{
  section_index: number;
  heading: string | null;
  content: string;
  page_start: number;
  page_end: number;
  keyword_terms: string[];
}> {
  const normalized = normalizeContent(text);
  if (!normalized) {
    return [];
  }

  const paragraphChunks = normalized
    .split(/\n{2,}/)
    .map((chunk) => chunk.trim())
    .filter(Boolean);

  const sections: Array<{
    section_index: number;
    heading: string | null;
    content: string;
    page_start: number;
    page_end: number;
    keyword_terms: string[];
  }> = [];

  let buffer: string[] = [];
  let sectionIndex = 0;

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
      heading: buffer[0]?.length && buffer[0]!.length < 120 ? buffer[0]! : null,
      content,
      page_start: pageStart,
      page_end: pageStart + approxPages - 1,
      keyword_terms: keywordTerms
    });
    buffer = [];
    sectionIndex += 1;
  }

  for (const chunk of paragraphChunks) {
    buffer.push(chunk);
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

export async function retrieveRelevantSections(
  supabase: SupabaseClient,
  params: {
    orgId: string;
    goalInput: string;
    topN?: number;
    similarityThreshold?: number;
    branchId?: string | null;
    department?: string | null;
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

  const { data, error } = await query;
  if (error || !data) {
    return [];
  }

  return (data as OrgDocumentSection[])
    .map((section) => ({
      section,
      score: calculateSimilarity(inputKeywords, new Set(section.keyword_terms ?? []))
    }))
    .filter(({ score }) => score >= similarityThreshold)
    .sort((left, right) => right.score - left.score)
    .slice(0, topN)
    .map(({ section }) => section);
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
        docContexts.push(`[SECTION ${doc.section_index + 1}${doc.heading ? `: ${doc.heading}` : ""}]\n${excerpt}\n`);
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
  }
): Promise<void> {
  // Extract topics from content if not provided
  let topics = userProvidedTopics || [];
  if (topics.length === 0) {
    const contentKeywords = extractKeywords(fileContent);
    topics = Array.from(contentKeywords).slice(0, 10);
  }

  // Count pages (rough estimate: 3000 chars ≈ 1 page)
  const pageCount = Math.ceil(fileContent.length / 3000);

  const normalizedContent = normalizeContent(fileContent);
  const sections = splitIntoSections(normalizedContent);

  const { error } = await supabase
    .from("org_documents")
    .update({
      is_indexed: true,
      indexed_at: new Date().toISOString(),
      page_count: pageCount,
      key_topics: topics,
      normalized_content: normalizedContent,
      section_count: sections.length
    })
    .eq("id", documentId);

  if (error) {
    console.warn(`Failed to index document: ${error.message}`);
    return;
  }

  if (!options?.orgId) {
    return;
  }

  await supabase.from("org_document_sections").delete().eq("document_id", documentId);
  if (sections.length === 0) {
    return;
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
      content: section.content,
      keyword_terms: section.keyword_terms
    }))
  );

  if (insertResult.error) {
    console.warn(`Failed to index document sections: ${insertResult.error.message}`);
  }
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
