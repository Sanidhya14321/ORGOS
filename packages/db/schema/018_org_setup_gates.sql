BEGIN;

ALTER TABLE public.orgs
  ADD COLUMN IF NOT EXISTS setup_positions_completed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS setup_company_docs_completed_at TIMESTAMPTZ;

COMMIT;
