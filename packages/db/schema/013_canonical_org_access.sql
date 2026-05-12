BEGIN;

CREATE TABLE IF NOT EXISTS public.org_branches (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  code TEXT NOT NULL,
  city TEXT,
  country TEXT,
  timezone TEXT DEFAULT 'UTC',
  is_headquarters BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, code),
  UNIQUE(org_id, name)
);

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS power_level INT NOT NULL DEFAULT 50,
  ADD COLUMN IF NOT EXISTS visibility_scope TEXT NOT NULL DEFAULT 'org' CHECK (
    visibility_scope IN ('org', 'branch', 'department', 'subtree', 'self')
  ),
  ADD COLUMN IF NOT EXISTS seat_count INT NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS max_concurrent_tasks INT NOT NULL DEFAULT 10,
  ADD COLUMN IF NOT EXISTS compensation_band JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

UPDATE public.positions
SET power_level = CASE
  WHEN level <= 0 THEN 100
  WHEN level = 1 THEN 80
  WHEN level = 2 THEN 60
  WHEN level = 3 THEN 40
  ELSE 20
END
WHERE power_level = 50;

CREATE TABLE IF NOT EXISTS public.position_assignments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  position_id UUID NOT NULL REFERENCES public.positions(id) ON DELETE CASCADE,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL,
  seat_label TEXT,
  assignment_status TEXT NOT NULL DEFAULT 'vacant' CHECK (
    assignment_status IN ('vacant', 'invited', 'active', 'inactive')
  ),
  activation_state TEXT NOT NULL DEFAULT 'pending' CHECK (
    activation_state IN ('pending', 'activated', 'suspended', 'revoked')
  ),
  invite_email TEXT,
  invited_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  invited_at TIMESTAMPTZ,
  activated_at TIMESTAMPTZ,
  deactivated_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_assignments_position_active
  ON public.position_assignments(position_id)
  WHERE deactivated_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_position_assignments_org_status
  ON public.position_assignments(org_id, assignment_status, activation_state);

ALTER TABLE public.position_credentials
  ADD COLUMN IF NOT EXISTS invite_token TEXT,
  ADD COLUMN IF NOT EXISTS invite_code TEXT,
  ADD COLUMN IF NOT EXISTS invitation_url TEXT,
  ADD COLUMN IF NOT EXISTS activation_status TEXT NOT NULL DEFAULT 'pending' CHECK (
    activation_status IN ('pending', 'activated', 'revoked', 'expired')
  ),
  ADD COLUMN IF NOT EXISTS issued_mode TEXT NOT NULL DEFAULT 'hybrid' CHECK (
    issued_mode IN ('invite', 'temporary_password', 'hybrid')
  ),
  ADD COLUMN IF NOT EXISTS invite_expires_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS activated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS auth_user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invite_email TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_credentials_invite_token
  ON public.position_credentials(invite_token)
  WHERE invite_token IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS idx_position_credentials_invite_code
  ON public.position_credentials(invite_code)
  WHERE invite_code IS NOT NULL;

ALTER TABLE public.org_documents
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS department TEXT,
  ADD COLUMN IF NOT EXISTS summary TEXT,
  ADD COLUMN IF NOT EXISTS normalized_content TEXT,
  ADD COLUMN IF NOT EXISTS retrieval_mode TEXT NOT NULL DEFAULT 'vectorless' CHECK (
    retrieval_mode IN ('vectorless', 'vector', 'hybrid')
  ),
  ADD COLUMN IF NOT EXISTS section_count INT NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.org_document_sections (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  document_id UUID NOT NULL REFERENCES public.org_documents(id) ON DELETE CASCADE,
  branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL,
  department TEXT,
  section_index INT NOT NULL,
  page_start INT,
  page_end INT,
  heading TEXT,
  content TEXT NOT NULL,
  keyword_terms TEXT[] NOT NULL DEFAULT '{}'::text[],
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(document_id, section_index)
);

CREATE INDEX IF NOT EXISTS idx_org_document_sections_org_document
  ON public.org_document_sections(org_id, document_id);

CREATE INDEX IF NOT EXISTS idx_org_document_sections_keywords
  ON public.org_document_sections USING GIN(keyword_terms);

ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS branch_id UUID REFERENCES public.org_branches(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS hiring_manager_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS vacancy_status TEXT NOT NULL DEFAULT 'open' CHECK (
    vacancy_status IN ('open', 'backfill', 'pipeline', 'filled', 'cancelled')
  );

ALTER TABLE public.applicants
  ADD COLUMN IF NOT EXISTS candidate_resume_summary TEXT,
  ADD COLUMN IF NOT EXISTS hired_position_assignment_id UUID REFERENCES public.position_assignments(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.goal_forecasts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  horizon_days INT NOT NULL CHECK (horizon_days > 0),
  expected_completion_pct INT NOT NULL CHECK (expected_completion_pct BETWEEN 0 AND 100),
  remaining_hours NUMERIC(10,2) NOT NULL DEFAULT 0,
  confidence NUMERIC(5,4),
  factors JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(goal_id, horizon_days)
);

CREATE INDEX IF NOT EXISTS idx_goal_forecasts_org_goal
  ON public.goal_forecasts(org_id, goal_id, horizon_days);

COMMIT;
