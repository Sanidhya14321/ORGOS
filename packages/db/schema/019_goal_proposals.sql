BEGIN;

CREATE TABLE IF NOT EXISTS public.goal_proposals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  created_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT,
  raw_input TEXT,
  target_departments TEXT[] NOT NULL DEFAULT '{}',
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'escalated')),
  current_reviewer_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  approved_goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_goal_proposals_org ON public.goal_proposals(org_id);
CREATE INDEX IF NOT EXISTS idx_goal_proposals_status ON public.goal_proposals(status);

COMMIT;
