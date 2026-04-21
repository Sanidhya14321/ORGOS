BEGIN;

ALTER TABLE public.positions
  DROP CONSTRAINT IF EXISTS positions_level_check;

ALTER TABLE public.positions
  ADD CONSTRAINT positions_level_check CHECK (level >= 0);

COMMIT;
