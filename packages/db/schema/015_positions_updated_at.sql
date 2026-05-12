BEGIN;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();

UPDATE public.positions
SET updated_at = created_at
WHERE updated_at IS NULL;

COMMIT;
