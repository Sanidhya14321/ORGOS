BEGIN;

CREATE TABLE IF NOT EXISTS public.org_settings (
  org_id UUID PRIMARY KEY REFERENCES public.orgs(id) ON DELETE CASCADE,
  industry TEXT NOT NULL CHECK (
    industry IN (
      'tech',
      'legal',
      'healthcare',
      'construction',
      'finance',
      'retail',
      'manufacturing',
      'education',
      'nonprofit',
      'hospitality'
    )
  ),
  company_size TEXT NOT NULL CHECK (company_size IN ('startup', 'mid', 'enterprise')),
  timezone TEXT NOT NULL DEFAULT 'UTC',
  work_week_hours INT NOT NULL DEFAULT 40 CHECK (work_week_hours BETWEEN 1 AND 120),
  fiscal_year_start INT NOT NULL DEFAULT 1 CHECK (fiscal_year_start BETWEEN 1 AND 12),
  logo_url TEXT,
  primary_color TEXT,
  custom_domain TEXT UNIQUE,
  sso_enabled BOOLEAN NOT NULL DEFAULT false,
  sso_config JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.workflow_definitions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  org_id UUID NOT NULL REFERENCES public.orgs(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  entity_type TEXT NOT NULL DEFAULT 'task' CHECK (entity_type = 'task'),
  stages JSONB NOT NULL,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workflow_definitions_org_default_task
  ON public.workflow_definitions(org_id, entity_type)
  WHERE is_default = true;

CREATE INDEX IF NOT EXISTS idx_workflow_definitions_org_entity
  ON public.workflow_definitions(org_id, entity_type);

ALTER TABLE public.org_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.workflow_definitions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS org_settings_select_scoped ON public.org_settings;
CREATE POLICY org_settings_select_scoped ON public.org_settings
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.org_id = public.org_settings.org_id
    )
  );

DROP POLICY IF EXISTS org_settings_insert_exec_scoped ON public.org_settings;
CREATE POLICY org_settings_insert_exec_scoped ON public.org_settings
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.org_id = public.org_settings.org_id
        AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS org_settings_update_exec_scoped ON public.org_settings;
CREATE POLICY org_settings_update_exec_scoped ON public.org_settings
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.org_id = public.org_settings.org_id
        AND u.role IN ('ceo', 'cfo')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.org_id = public.org_settings.org_id
        AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS workflow_definitions_select_scoped ON public.workflow_definitions;
CREATE POLICY workflow_definitions_select_scoped ON public.workflow_definitions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.org_id = public.workflow_definitions.org_id
    )
  );

DROP POLICY IF EXISTS workflow_definitions_insert_exec_scoped ON public.workflow_definitions;
CREATE POLICY workflow_definitions_insert_exec_scoped ON public.workflow_definitions
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.org_id = public.workflow_definitions.org_id
        AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS workflow_definitions_update_exec_scoped ON public.workflow_definitions;
CREATE POLICY workflow_definitions_update_exec_scoped ON public.workflow_definitions
  FOR UPDATE USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.org_id = public.workflow_definitions.org_id
        AND u.role IN ('ceo', 'cfo')
    )
  )
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid()
        AND u.org_id = public.workflow_definitions.org_id
        AND u.role IN ('ceo', 'cfo')
    )
  );

COMMIT;
