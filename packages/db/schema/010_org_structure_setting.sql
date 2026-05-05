BEGIN;

ALTER TABLE public.org_settings
  ADD COLUMN IF NOT EXISTS org_structure TEXT CHECK (
    org_structure IN (
      'hierarchical',
      'functional',
      'flat',
      'divisional',
      'matrix',
      'team',
      'network',
      'process',
      'circular',
      'line'
    )
  );

UPDATE public.org_settings
SET org_structure = COALESCE(org_structure, 'hierarchical')
WHERE org_structure IS NULL;

COMMIT;
