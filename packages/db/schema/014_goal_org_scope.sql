BEGIN;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS org_id UUID REFERENCES public.orgs(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS idx_goals_org_status ON public.goals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_goals_org_priority ON public.goals(org_id, priority);

UPDATE public.goals AS g
SET org_id = u.org_id
FROM public.users AS u
WHERE g.created_by = u.id
  AND g.org_id IS NULL
  AND u.org_id IS NOT NULL;

UPDATE public.goals AS g
SET org_id = task_org.org_id
FROM (
  SELECT goal_id, MIN(org_id::text)::uuid AS org_id
  FROM public.tasks
  WHERE org_id IS NOT NULL
  GROUP BY goal_id
) AS task_org
WHERE g.id = task_org.goal_id
  AND g.org_id IS NULL;

COMMIT;
