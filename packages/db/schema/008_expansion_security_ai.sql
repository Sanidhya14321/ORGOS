BEGIN;

ALTER TABLE public.goals
  ADD COLUMN IF NOT EXISTS description_ciphertext BYTEA,
  ADD COLUMN IF NOT EXISTS description_ciphertext_updated_at TIMESTAMPTZ;

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS description_ciphertext BYTEA,
  ADD COLUMN IF NOT EXISTS description_ciphertext_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS estimated_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS actual_hours NUMERIC(8,2),
  ADD COLUMN IF NOT EXISTS priority_score NUMERIC(5,2),
  ADD COLUMN IF NOT EXISTS meeting_source TEXT,
  ADD COLUMN IF NOT EXISTS workflow_id UUID,
  ADD COLUMN IF NOT EXISTS workflow_stage TEXT;

ALTER TABLE public.positions
  ADD COLUMN IF NOT EXISTS reports_to_position_id UUID REFERENCES public.positions(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS permissions JSONB NOT NULL DEFAULT '[]'::jsonb;

ALTER TABLE public.audit_log
  ADD COLUMN IF NOT EXISTS category TEXT NOT NULL DEFAULT 'general' CHECK (category IN ('general', 'security', 'auth', 'integration', 'analytics', 'billing')),
  ADD COLUMN IF NOT EXISTS severity TEXT NOT NULL DEFAULT 'info' CHECK (severity IN ('debug', 'info', 'warn', 'error', 'critical')),
  ADD COLUMN IF NOT EXISTS user_agent TEXT,
  ADD COLUMN IF NOT EXISTS ip_address TEXT,
  ADD COLUMN IF NOT EXISTS path TEXT,
  ADD COLUMN IF NOT EXISTS metadata JSONB NOT NULL DEFAULT '{}'::jsonb;

CREATE TABLE IF NOT EXISTS public.time_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  user_id UUID REFERENCES public.users(id) ON DELETE SET NULL,
  source TEXT NOT NULL DEFAULT 'manual' CHECK (source IN ('manual', 'timer', 'meeting', 'import')),
  meeting_source TEXT,
  started_at TIMESTAMPTZ NOT NULL,
  ended_at TIMESTAMPTZ,
  minutes INT GENERATED ALWAYS AS (
    CASE
      WHEN ended_at IS NULL THEN NULL
      ELSE GREATEST(1, CEIL(EXTRACT(EPOCH FROM (ended_at - started_at)) / 60.0)::INT)
    END
  ) STORED,
  notes TEXT,
  billable BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goal_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  name TEXT NOT NULL,
  description TEXT,
  default_priority TEXT NOT NULL DEFAULT 'medium' CHECK (default_priority IN ('low', 'medium', 'high', 'critical')),
  template JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.custom_fields (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('goal', 'task', 'user', 'applicant', 'meeting')),
  field_key TEXT NOT NULL,
  label TEXT NOT NULL,
  field_type TEXT NOT NULL CHECK (field_type IN ('text', 'number', 'boolean', 'date', 'json', 'select')),
  options JSONB NOT NULL DEFAULT '[]'::jsonb,
  required BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, entity_type, field_key)
);

CREATE TABLE IF NOT EXISTS public.custom_field_values (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  field_id UUID NOT NULL REFERENCES public.custom_fields(id) ON DELETE CASCADE,
  entity_type TEXT NOT NULL CHECK (entity_type IN ('goal', 'task', 'user', 'applicant', 'meeting')),
  entity_id UUID NOT NULL,
  value JSONB NOT NULL DEFAULT 'null'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(field_id, entity_id)
);

CREATE TABLE IF NOT EXISTS public.integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'teams', 'google_calendar', 'zapier', 'webhook')),
  status TEXT NOT NULL DEFAULT 'inactive' CHECK (status IN ('inactive', 'active', 'error')),
  config JSONB NOT NULL DEFAULT '{}'::jsonb,
  last_synced_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, provider)
);

CREATE TABLE IF NOT EXISTS public.user_integrations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  provider TEXT NOT NULL CHECK (provider IN ('slack', 'google_calendar', 'microsoft_calendar')),
  access_token_encrypted TEXT,
  refresh_token_encrypted TEXT,
  scopes TEXT[] NOT NULL DEFAULT '{}'::text[],
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, provider)
);

CREATE TABLE IF NOT EXISTS public.meeting_ingestions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  source TEXT NOT NULL CHECK (source IN ('calendar', 'zoom', 'teams', 'manual', 'upload')),
  external_id TEXT,
  subject TEXT NOT NULL,
  notes TEXT,
  attendees JSONB NOT NULL DEFAULT '[]'::jsonb,
  tasks_extracted JSONB NOT NULL DEFAULT '[]'::jsonb,
  meeting_at TIMESTAMPTZ,
  created_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.analytics_snapshots (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  snapshot_date DATE NOT NULL DEFAULT CURRENT_DATE,
  metrics JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(org_id, snapshot_date)
);

CREATE TABLE IF NOT EXISTS public.push_subscriptions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  endpoint TEXT NOT NULL,
  p256dh TEXT NOT NULL,
  auth TEXT NOT NULL,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE(user_id, endpoint)
);

CREATE TABLE IF NOT EXISTS public.org_billing (
  org_id UUID PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  plan TEXT NOT NULL DEFAULT 'starter' CHECK (plan IN ('starter', 'growth', 'scale', 'enterprise')),
  seat_limit INT NOT NULL DEFAULT 25,
  usage JSONB NOT NULL DEFAULT '{}'::jsonb,
  renewal_date DATE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_time_logs_org_started_at ON public.time_logs(org_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_time_logs_task_id ON public.time_logs(task_id);
CREATE INDEX IF NOT EXISTS idx_goal_templates_org_updated_at ON public.goal_templates(org_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_custom_fields_org_entity ON public.custom_fields(org_id, entity_type);
CREATE INDEX IF NOT EXISTS idx_custom_field_values_org_entity ON public.custom_field_values(org_id, entity_type, entity_id);
CREATE INDEX IF NOT EXISTS idx_integrations_org_provider ON public.integrations(org_id, provider);
CREATE INDEX IF NOT EXISTS idx_user_integrations_user_provider ON public.user_integrations(user_id, provider);
CREATE INDEX IF NOT EXISTS idx_meeting_ingestions_org_created_at ON public.meeting_ingestions(org_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_analytics_snapshots_org_date ON public.analytics_snapshots(org_id, snapshot_date DESC);
CREATE INDEX IF NOT EXISTS idx_push_subscriptions_user_id ON public.push_subscriptions(user_id);

ALTER TABLE public.time_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goal_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_fields ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.custom_field_values ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_integrations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.meeting_ingestions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.analytics_snapshots ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.push_subscriptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.org_billing ENABLE ROW LEVEL SECURITY;

CREATE OR REPLACE FUNCTION public.sync_goal_description_ciphertext()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  encryption_key TEXT := current_setting('app.field_encryption_key', true);
BEGIN
  IF NEW.description IS NULL THEN
    NEW.description_ciphertext := NULL;
    NEW.description_ciphertext_updated_at := now();
    RETURN NEW;
  END IF;

  IF encryption_key IS NOT NULL AND length(encryption_key) > 0 THEN
    NEW.description_ciphertext := pgp_sym_encrypt(NEW.description, encryption_key);
  END IF;
  NEW.description_ciphertext_updated_at := now();
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_task_description_ciphertext()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
DECLARE
  encryption_key TEXT := current_setting('app.field_encryption_key', true);
BEGIN
  IF NEW.description IS NULL THEN
    NEW.description_ciphertext := NULL;
    NEW.description_ciphertext_updated_at := now();
    RETURN NEW;
  END IF;

  IF encryption_key IS NOT NULL AND length(encryption_key) > 0 THEN
    NEW.description_ciphertext := pgp_sym_encrypt(NEW.description, encryption_key);
  END IF;
  NEW.description_ciphertext_updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_goal_description_ciphertext ON public.goals;
CREATE TRIGGER trg_sync_goal_description_ciphertext
BEFORE INSERT OR UPDATE OF description ON public.goals
FOR EACH ROW
EXECUTE FUNCTION public.sync_goal_description_ciphertext();

DROP TRIGGER IF EXISTS trg_sync_task_description_ciphertext ON public.tasks;
CREATE TRIGGER trg_sync_task_description_ciphertext
BEFORE INSERT OR UPDATE OF description ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.sync_task_description_ciphertext();

COMMIT;