BEGIN;

-- Position Credentials Table
-- Stores auto-generated email/password pairs for each position
CREATE TABLE IF NOT EXISTS public.position_credentials (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  email TEXT NOT NULL,
  password_hash TEXT NOT NULL,
  plaintext_password TEXT, -- NULL after first CEO view (security measure)
  force_password_change BOOLEAN NOT NULL DEFAULT true,
  first_login_at TIMESTAMPTZ,
  reset_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, position_id),
  UNIQUE(org_id, email)
);

CREATE INDEX IF NOT EXISTS idx_position_credentials_org_id ON public.position_credentials(org_id);
CREATE INDEX IF NOT EXISTS idx_position_credentials_position_id ON public.position_credentials(position_id);

-- Organization Documents Table
-- Stores documents (PDFs, word docs, etc.) for RAG context injection
CREATE TABLE IF NOT EXISTS public.org_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_content TEXT NOT NULL, -- Raw plaintext (post-OCR/extraction)
  doc_type TEXT NOT NULL DEFAULT 'other' CHECK (doc_type IN (
    'handbook',
    'policy',
    'structure',
    'financial',
    'process',
    'other'
  )),
  file_size INT, -- Bytes
  mime_type TEXT, -- application/pdf, application/vnd.openxmlformats-officedocument.wordprocessingml.document, etc.
  is_indexed BOOLEAN NOT NULL DEFAULT false,
  key_topics TEXT[] DEFAULT '{}', -- Extracted keywords for RAG retrieval
  page_count INT, -- Estimated from file_content length (3000 chars ≈ 1 page)
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  archived_at TIMESTAMPTZ, -- Soft delete
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  uploaded_at TIMESTAMPTZ DEFAULT now(),
  indexed_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_org_documents_org_id ON public.org_documents(org_id);
CREATE INDEX IF NOT EXISTS idx_org_documents_is_indexed ON public.org_documents(is_indexed);
CREATE INDEX IF NOT EXISTS idx_org_documents_archived_at ON public.org_documents(archived_at);
CREATE INDEX IF NOT EXISTS idx_org_documents_doc_type ON public.org_documents(doc_type);

-- Organization Structure Suggestions Table
-- Tracks AI-generated org structure suggestions and CEO approvals
CREATE TABLE IF NOT EXISTS public.org_structure_suggestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  company_size TEXT NOT NULL, -- '1-10', '11-50', '51-200', '201-1000', '1000+'
  position_count INT NOT NULL,
  branch_count INT NOT NULL,
  department_count INT NOT NULL,
  suggested_kind TEXT NOT NULL CHECK (suggested_kind IN (
    'flat',
    'functional',
    'divisional',
    'hierarchical'
  )),
  reason TEXT, -- Explanation of why this structure is recommended
  confidence FLOAT CHECK (confidence >= 0.0 AND confidence <= 1.0),
  position_assignments JSONB, -- Array of {position_id, title, level, reports_to}
  ceo_reviewed BOOLEAN NOT NULL DEFAULT false,
  ceo_approved BOOLEAN NOT NULL DEFAULT false,
  applied BOOLEAN NOT NULL DEFAULT false,
  ceo_reviewed_at TIMESTAMPTZ,
  ceo_approved_at TIMESTAMPTZ,
  applied_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_org_structure_suggestions_org_id ON public.org_structure_suggestions(org_id);
CREATE INDEX IF NOT EXISTS idx_org_structure_suggestions_applied ON public.org_structure_suggestions(applied);

-- Enable RLS on new tables
ALTER TABLE public.position_credentials ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_structure_suggestions ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Users can only see credentials/documents/suggestions for their org
CREATE POLICY position_credentials_org_policy
  ON public.position_credentials
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY org_documents_org_policy
  ON public.org_documents
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.users WHERE id = auth.uid()
    )
  );

CREATE POLICY org_structure_suggestions_org_policy
  ON public.org_structure_suggestions
  FOR SELECT
  USING (
    org_id IN (
      SELECT org_id FROM public.users WHERE id = auth.uid()
    )
  );

-- CEO-only write permissions for credentials
CREATE POLICY position_credentials_ceo_write
  ON public.position_credentials
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.users 
      WHERE id = auth.uid() AND role = 'ceo'
    )
  );

CREATE POLICY position_credentials_ceo_update
  ON public.position_credentials
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.users 
      WHERE id = auth.uid() AND role = 'ceo'
    )
  );

-- Manager/Executive can upload documents
CREATE POLICY org_documents_write
  ON public.org_documents
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.users 
      WHERE id = auth.uid() AND role IN ('ceo', 'cfo', 'manager')
    )
  );

-- CEO-only org structure suggestions
CREATE POLICY org_structure_suggestions_ceo_write
  ON public.org_structure_suggestions
  FOR INSERT
  WITH CHECK (
    org_id IN (
      SELECT org_id FROM public.users 
      WHERE id = auth.uid() AND role = 'ceo'
    )
  );

CREATE POLICY org_structure_suggestions_ceo_update
  ON public.org_structure_suggestions
  FOR UPDATE
  USING (
    org_id IN (
      SELECT org_id FROM public.users 
      WHERE id = auth.uid() AND role = 'ceo'
    )
  );

COMMIT;
