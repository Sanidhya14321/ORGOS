/**
 * RAG Retrieval Service (Vectorless)
 * Retrieves relevant company documents for goal decomposition
 * Uses keyword matching + page-based indexing (no vector embeddings)
 */

import { SupabaseClient } from "@supabase/supabase-js";
import { OrgDocument, RAGContextSchema } from "@orgos/shared-types";

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

  // Extract keywords from goal input
  const inputKeywords = extractKeywords(goalInput);

  // Score all documents
  const scored = documents.map((doc) => {
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

/**
 * Build RAG context for LLM prompt injection
 * Concatenates relevant documents into instruction text
 */
export function buildRAGContext(
  goalInput: string,
  relevantDocs: OrgDocument[]
): {
  contextInstruction: string;
  docContexts: string[];
} {
  const docContexts: string[] = [];
  let contextInstruction = "";

  if (relevantDocs.length > 0) {
    contextInstruction = `Use the following company information to inform your decomposition:\n`;

    for (const doc of relevantDocs) {
      const excerpt = doc.file_content.substring(0, 1500); // Limit excerpt length
      docContexts.push(`[${doc.doc_type.toUpperCase()}: ${doc.file_name}]\n${excerpt}\n`);
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
  userProvidedTopics?: string[]
): Promise<void> {
  // Extract topics from content if not provided
  let topics = userProvidedTopics || [];
  if (topics.length === 0) {
    const contentKeywords = extractKeywords(fileContent);
    topics = Array.from(contentKeywords).slice(0, 10);
  }

  // Count pages (rough estimate: 3000 chars ≈ 1 page)
  const pageCount = Math.ceil(fileContent.length / 3000);

  const { error } = await supabase
    .from("org_documents")
    .update({
      is_indexed: true,
      indexed_at: new Date().toISOString(),
      page_count: pageCount,
      key_topics: topics
    })
    .eq("id", documentId);

  if (error) {
    console.warn(`Failed to index document: ${error.message}`);
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

  return (data || []) as OrgDocument[];
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
