BEGIN;

-- Full-text index on section bodies (vectorless / hybrid lexical path upgrade).
ALTER TABLE public.org_document_sections
  ADD COLUMN IF NOT EXISTS content_tsv tsvector
  GENERATED ALWAYS AS (to_tsvector('english', coalesce(content, ''))) STORED;

CREATE INDEX IF NOT EXISTS idx_org_document_sections_content_tsv
  ON public.org_document_sections USING GIN (content_tsv);

CREATE OR REPLACE FUNCTION public.match_org_document_sections_tsvector(
  p_org_id UUID,
  p_query TEXT,
  p_match_count INT DEFAULT 20,
  p_branch_id UUID DEFAULT NULL,
  p_department TEXT DEFAULT NULL,
  p_doc_types TEXT[] DEFAULT NULL,
  p_knowledge_scopes TEXT[] DEFAULT NULL,
  p_source_formats TEXT[] DEFAULT NULL
)
RETURNS SETOF public.org_document_sections
LANGUAGE sql
STABLE
AS $$
  WITH q AS (
    SELECT websearch_to_tsquery('english', nullif(trim(p_query), '')) AS tsq
  )
  SELECT s.*
  FROM public.org_document_sections s, q
  WHERE s.org_id = p_org_id
    AND q.tsq IS NOT NULL
    AND s.content_tsv @@ q.tsq
    AND (p_branch_id IS NULL OR s.branch_id IS NOT DISTINCT FROM p_branch_id)
    AND (p_department IS NULL OR s.department IS NOT DISTINCT FROM p_department)
    AND (p_doc_types IS NULL OR cardinality(p_doc_types) = 0 OR s.doc_type = ANY (p_doc_types))
    AND (p_source_formats IS NULL OR cardinality(p_source_formats) = 0 OR s.source_format = ANY (p_source_formats))
    AND (
      p_knowledge_scopes IS NULL
      OR cardinality(p_knowledge_scopes) = 0
      OR cardinality(s.knowledge_scope) = 0
      OR s.knowledge_scope && p_knowledge_scopes
    )
  ORDER BY ts_rank_cd(s.content_tsv, q.tsq) DESC
  LIMIT greatest(coalesce(p_match_count, 20), 1);
$$;

GRANT EXECUTE ON FUNCTION public.match_org_document_sections_tsvector(
  UUID, TEXT, INT, UUID, TEXT, TEXT[], TEXT[], TEXT[]
) TO authenticated, service_role;

COMMIT;
