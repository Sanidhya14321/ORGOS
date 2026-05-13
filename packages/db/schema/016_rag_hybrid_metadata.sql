BEGIN;

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS knowledge_scope TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT 'unknown',
  ADD COLUMN IF NOT EXISTS content_hash TEXT,
  ADD COLUMN IF NOT EXISTS ingestion_warnings JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.org_document_sections
  ADD COLUMN IF NOT EXISTS section_path TEXT,
  ADD COLUMN IF NOT EXISTS doc_type TEXT NOT NULL DEFAULT 'other',
  ADD COLUMN IF NOT EXISTS knowledge_scope TEXT[] NOT NULL DEFAULT '{}'::text[],
  ADD COLUMN IF NOT EXISTS source_format TEXT NOT NULL DEFAULT 'unknown';

CREATE INDEX IF NOT EXISTS idx_org_documents_knowledge_scope
  ON public.org_documents USING GIN(knowledge_scope);

CREATE INDEX IF NOT EXISTS idx_org_document_sections_scope
  ON public.org_document_sections USING GIN(knowledge_scope);

CREATE INDEX IF NOT EXISTS idx_org_document_sections_doc_type
  ON public.org_document_sections(doc_type);

CREATE INDEX IF NOT EXISTS idx_org_document_sections_source_format
  ON public.org_document_sections(source_format);

CREATE INDEX IF NOT EXISTS embeddings_metadata_idx
  ON public.embeddings USING GIN(metadata);

CREATE OR REPLACE FUNCTION public.match_embeddings(
  p_org_id UUID,
  p_query_embedding vector(1536),
  p_match_count INT DEFAULT 5,
  p_source_types TEXT[] DEFAULT NULL,
  p_doc_types TEXT[] DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_branch_id UUID DEFAULT NULL,
  p_knowledge_scopes TEXT[] DEFAULT NULL
)
RETURNS TABLE (
  id UUID,
  source_type TEXT,
  source_id UUID,
  chunk_index INT,
  text_snippet TEXT,
  metadata JSONB,
  score DOUBLE PRECISION
)
LANGUAGE sql
STABLE
AS $$
  SELECT
    e.id,
    e.source_type,
    e.source_id,
    e.chunk_index,
    e.text_snippet,
    e.metadata,
    1 - (e.embedding <=> p_query_embedding) AS score
  FROM public.embeddings e
  WHERE e.org_id = p_org_id
    AND (p_source_types IS NULL OR e.source_type = ANY(p_source_types))
    AND (p_doc_types IS NULL OR COALESCE(e.metadata->>'docType', '') = ANY(p_doc_types))
    AND (p_department IS NULL OR COALESCE(e.metadata->>'department', '') = p_department)
    AND (p_branch_id IS NULL OR COALESCE(e.metadata->>'branchId', '') = p_branch_id::text)
    AND (
      p_knowledge_scopes IS NULL
      OR EXISTS (
        SELECT 1
        FROM jsonb_array_elements_text(COALESCE(e.metadata->'knowledgeScope', '[]'::jsonb)) AS scope(value)
        WHERE scope.value = ANY(p_knowledge_scopes)
      )
    )
  ORDER BY e.embedding <=> p_query_embedding
  LIMIT GREATEST(p_match_count, 1);
$$;

COMMIT;
