BEGIN;

-- ==============================
-- Workflow v2: task ownership, dependencies, recurrence, evidence, comments
-- ==============================
ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS owner_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS assignees UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS watchers UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS depends_on UUID[] NOT NULL DEFAULT '{}'::uuid[],
  ADD COLUMN IF NOT EXISTS recurrence_cron TEXT,
  ADD COLUMN IF NOT EXISTS recurrence_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS recurrence_timezone TEXT DEFAULT 'UTC',
  ADD COLUMN IF NOT EXISTS next_run_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS requires_evidence BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_approved BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS completion_approved_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS completion_approved_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS completion_notes TEXT,
  ADD COLUMN IF NOT EXISTS blocked_by_count INT NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS estimated_effort_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS is_overdue BOOLEAN NOT NULL DEFAULT false;

UPDATE public.tasks
SET owner_id = COALESCE(owner_id, assigned_to)
WHERE owner_id IS NULL;

-- Evidence attachments stored in Supabase Storage (bucket path stored in storage_path)
CREATE TABLE IF NOT EXISTS public.task_attachments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  uploaded_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  attachment_type TEXT NOT NULL CHECK (attachment_type IN ('file', 'link', 'form')), 
  storage_path TEXT,
  external_url TEXT,
  title TEXT,
  mime_type TEXT,
  size_bytes BIGINT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  CHECK (
    (attachment_type = 'file' AND storage_path IS NOT NULL)
    OR (attachment_type IN ('link', 'form') AND external_url IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS public.task_comments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  parent_comment_id UUID REFERENCES public.task_comments(id) ON DELETE CASCADE,
  author_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  body TEXT NOT NULL,
  mentions UUID[] NOT NULL DEFAULT '{}'::uuid[],
  edited_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================
-- Recruitment module
-- ==============================
CREATE TABLE IF NOT EXISTS public.jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  department TEXT NOT NULL,
  description TEXT NOT NULL,
  required_skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  experience_years INT,
  employment_type TEXT,
  location TEXT,
  salary_min INT,
  salary_max INT,
  status TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'paused', 'closed')),
  posted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  closes_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.applicants (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  full_name TEXT NOT NULL,
  email TEXT NOT NULL,
  phone TEXT,
  linkedin_url TEXT,
  portfolio_url TEXT,
  resume_path TEXT,
  cover_letter TEXT,
  skills TEXT[] NOT NULL DEFAULT '{}'::text[],
  experience_years INT,
  source TEXT NOT NULL DEFAULT 'direct' CHECK (source IN ('direct', 'referral', 'linkedin', 'job_board')),
  stage TEXT NOT NULL DEFAULT 'applied' CHECK (stage IN ('applied', 'screening', 'interview', 'offer', 'hired', 'rejected')),
  ai_score NUMERIC(5,4),
  ai_summary TEXT,
  ai_metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  applied_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(job_id, email)
);

CREATE TABLE IF NOT EXISTS public.referrals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID REFERENCES public.applicants(id) ON DELETE SET NULL,
  referred_by UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  job_id UUID NOT NULL REFERENCES public.jobs(id) ON DELETE CASCADE,
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  relationship TEXT,
  note TEXT,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'confirmed', 'rejected', 'hired')),
  bonus_eligible BOOLEAN NOT NULL DEFAULT false,
  bonus_paid BOOLEAN NOT NULL DEFAULT false,
  referral_token TEXT UNIQUE NOT NULL,
  candidate_name TEXT,
  candidate_email TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.interviews (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  interviewer_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  round INT NOT NULL CHECK (round > 0),
  interview_type TEXT NOT NULL CHECK (interview_type IN ('phone', 'video', 'onsite', 'technical', 'panel')),
  scheduled_at TIMESTAMPTZ NOT NULL,
  duration_mins INT NOT NULL DEFAULT 60,
  status TEXT NOT NULL DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  score INT CHECK (score BETWEEN 1 AND 5),
  feedback TEXT,
  recommendation TEXT CHECK (recommendation IN ('hire', 'pass', 'maybe')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.pipeline_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  applicant_id UUID NOT NULL REFERENCES public.applicants(id) ON DELETE CASCADE,
  actor_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  from_stage TEXT,
  to_stage TEXT NOT NULL,
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rejection_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  reason TEXT NOT NULL,
  email_body TEXT NOT NULL,
  auto_send BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- ==============================
-- Trigger helpers
-- ==============================
CREATE OR REPLACE FUNCTION public.task_dependencies_unresolved(dep_ids UUID[])
RETURNS INT
LANGUAGE plpgsql
AS $$
DECLARE
  unresolved INT := 0;
BEGIN
  IF dep_ids IS NULL OR array_length(dep_ids, 1) IS NULL THEN
    RETURN 0;
  END IF;

  SELECT COUNT(*)
  INTO unresolved
  FROM public.tasks t
  WHERE t.id = ANY(dep_ids)
    AND t.status <> 'completed';

  RETURN COALESCE(unresolved, 0);
END;
$$;

CREATE OR REPLACE FUNCTION public.refresh_blocked_by_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;

  NEW.blocked_by_count := public.task_dependencies_unresolved(NEW.depends_on);

  IF NEW.blocked_by_count > 0 AND NEW.status IN ('pending', 'active', 'in_progress') THEN
    NEW.status := 'blocked';
  ELSIF NEW.blocked_by_count = 0 AND NEW.status = 'blocked' THEN
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_refresh_blocked_by_count ON public.tasks;
CREATE TRIGGER trg_refresh_blocked_by_count
BEFORE INSERT OR UPDATE OF depends_on, status ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.refresh_blocked_by_count();

CREATE OR REPLACE FUNCTION public.auto_unlock_dependents()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.status = 'completed' AND OLD.status IS DISTINCT FROM NEW.status THEN
    UPDATE public.tasks t
    SET blocked_by_count = public.task_dependencies_unresolved(t.depends_on),
        status = CASE
          WHEN public.task_dependencies_unresolved(t.depends_on) = 0 AND t.status = 'blocked' THEN 'pending'
          ELSE t.status
        END,
        updated_at = now()
    WHERE NEW.id = ANY(t.depends_on);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_unlock_dependents ON public.tasks;
CREATE TRIGGER trg_auto_unlock_dependents
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.auto_unlock_dependents();

-- Recruitment stage history trigger
CREATE OR REPLACE FUNCTION public.log_pipeline_stage_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF OLD.stage IS DISTINCT FROM NEW.stage THEN
    INSERT INTO public.pipeline_events(applicant_id, actor_id, from_stage, to_stage, note)
    VALUES (NEW.id, NULL, OLD.stage, NEW.stage, 'Stage updated');
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_pipeline_stage_change ON public.applicants;
CREATE TRIGGER trg_log_pipeline_stage_change
AFTER UPDATE OF stage ON public.applicants
FOR EACH ROW
EXECUTE FUNCTION public.log_pipeline_stage_change();

-- ==============================
-- Indexes
-- ==============================
CREATE INDEX IF NOT EXISTS idx_tasks_owner_id ON public.tasks(owner_id);
CREATE INDEX IF NOT EXISTS idx_tasks_blocked_by_count ON public.tasks(blocked_by_count);
CREATE INDEX IF NOT EXISTS idx_tasks_depends_on_gin ON public.tasks USING GIN (depends_on);
CREATE INDEX IF NOT EXISTS idx_tasks_assignees_gin ON public.tasks USING GIN (assignees);
CREATE INDEX IF NOT EXISTS idx_tasks_watchers_gin ON public.tasks USING GIN (watchers);
CREATE INDEX IF NOT EXISTS idx_task_attachments_task_id ON public.task_attachments(task_id);
CREATE INDEX IF NOT EXISTS idx_task_comments_task_id ON public.task_comments(task_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_org_status ON public.jobs(org_id, status);
CREATE INDEX IF NOT EXISTS idx_jobs_org_department ON public.jobs(org_id, department);
CREATE INDEX IF NOT EXISTS idx_applicants_org_stage ON public.applicants(org_id, stage);
CREATE INDEX IF NOT EXISTS idx_applicants_job_id ON public.applicants(job_id);
CREATE INDEX IF NOT EXISTS idx_applicants_ai_score ON public.applicants(ai_score DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_referrals_org_status ON public.referrals(org_id, status);
CREATE INDEX IF NOT EXISTS idx_referrals_referred_by ON public.referrals(referred_by);
CREATE INDEX IF NOT EXISTS idx_referrals_token ON public.referrals(referral_token);
CREATE INDEX IF NOT EXISTS idx_interviews_applicant ON public.interviews(applicant_id, scheduled_at DESC);
CREATE INDEX IF NOT EXISTS idx_pipeline_events_applicant ON public.pipeline_events(applicant_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_rejection_templates_org ON public.rejection_templates(org_id);

COMMIT;
