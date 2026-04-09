BEGIN;

CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  email TEXT UNIQUE NOT NULL,
  full_name TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('ceo', 'cfo', 'manager', 'worker')),
  department TEXT,
  skills TEXT[] DEFAULT '{}',
  agent_enabled BOOLEAN NOT NULL DEFAULT true,
  open_task_count INT NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.goals (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_by UUID NOT NULL REFERENCES public.users(id),
  title TEXT NOT NULL,
  description TEXT,
  raw_input TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'paused', 'completed', 'cancelled')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high', 'critical')),
  kpi TEXT,
  deadline DATE,
  simulation BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.tasks (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  goal_id UUID NOT NULL REFERENCES public.goals(id) ON DELETE CASCADE,
  parent_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  depth INT NOT NULL CHECK (depth IN (0, 1, 2)),
  title TEXT NOT NULL,
  description TEXT,
  success_criteria TEXT NOT NULL,
  assigned_to UUID REFERENCES public.users(id) ON DELETE SET NULL,
  assigned_role TEXT NOT NULL CHECK (assigned_role IN ('ceo', 'cfo', 'manager', 'worker')),
  is_agent_task BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'in_progress', 'blocked', 'completed', 'cancelled')),
  deadline TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.reports (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id UUID NOT NULL REFERENCES public.tasks(id) ON DELETE CASCADE,
  submitted_by UUID REFERENCES public.users(id) ON DELETE SET NULL,
  is_agent BOOLEAN NOT NULL DEFAULT false,
  status TEXT NOT NULL CHECK (status IN ('completed', 'partial', 'blocked')),
  insight TEXT NOT NULL,
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  confidence DOUBLE PRECISION NOT NULL CHECK (confidence >= 0 AND confidence <= 1),
  sources JSONB NOT NULL DEFAULT '[]'::jsonb,
  escalate BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.tasks
  ADD COLUMN IF NOT EXISTS report_id UUID REFERENCES public.reports(id) ON DELETE SET NULL;

CREATE TABLE IF NOT EXISTS public.agent_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_type TEXT NOT NULL CHECK (agent_type IN ('ceo_agent', 'manager_agent', 'worker_agent', 'synthesis_agent')),
  task_id UUID REFERENCES public.tasks(id) ON DELETE SET NULL,
  goal_id UUID REFERENCES public.goals(id) ON DELETE SET NULL,
  action TEXT NOT NULL CHECK (action IN ('decompose', 'assign', 'execute', 'synthesize', 'escalate')),
  model TEXT NOT NULL,
  model_version TEXT,
  prompt_tokens INT,
  comp_tokens INT,
  latency_ms INT,
  input JSONB,
  output JSONB,
  error TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_tasks_assigned_to_status ON public.tasks(assigned_to, status);
CREATE INDEX IF NOT EXISTS idx_tasks_goal_id ON public.tasks(goal_id);
CREATE INDEX IF NOT EXISTS idx_goals_created_by_status ON public.goals(created_by, status);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.goals ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reports ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS users_select_own ON public.users;
CREATE POLICY users_select_own ON public.users
  FOR SELECT USING (auth.uid() = id);

DROP POLICY IF EXISTS users_select_exec_all ON public.users;
CREATE POLICY users_select_exec_all ON public.users
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS goals_insert_exec ON public.goals;
CREATE POLICY goals_insert_exec ON public.goals
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS goals_select_all_authenticated ON public.goals;
CREATE POLICY goals_select_all_authenticated ON public.goals
  FOR SELECT USING (auth.uid() IS NOT NULL);

DROP POLICY IF EXISTS tasks_select_own ON public.tasks;
CREATE POLICY tasks_select_own ON public.tasks
  FOR SELECT USING (assigned_to = auth.uid());

DROP POLICY IF EXISTS tasks_select_manager_dept ON public.tasks;
CREATE POLICY tasks_select_manager_dept ON public.tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.users mgr
      JOIN public.users assignee ON assignee.id = public.tasks.assigned_to
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'manager'
        AND mgr.department IS NOT NULL
        AND assignee.department = mgr.department
    )
  );

DROP POLICY IF EXISTS tasks_select_exec_all ON public.tasks;
CREATE POLICY tasks_select_exec_all ON public.tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS reports_insert_assignee ON public.reports;
CREATE POLICY reports_insert_assignee ON public.reports
  FOR INSERT WITH CHECK (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      WHERE t.id = public.reports.task_id
        AND t.assigned_to = auth.uid()
    )
  );

DROP POLICY IF EXISTS reports_select_scoped ON public.reports;
CREATE POLICY reports_select_scoped ON public.reports
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.tasks t
      LEFT JOIN public.users assignee ON assignee.id = t.assigned_to
      LEFT JOIN public.users viewer ON viewer.id = auth.uid()
      WHERE t.id = public.reports.task_id
        AND (
          t.assigned_to = auth.uid()
          OR (viewer.role = 'manager' AND viewer.department IS NOT NULL AND assignee.department = viewer.department)
          OR viewer.role IN ('ceo', 'cfo')
        )
    )
  );

DROP POLICY IF EXISTS agent_logs_select_exec_only ON public.agent_logs;
CREATE POLICY agent_logs_select_exec_only ON public.agent_logs
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ceo', 'cfo')
    )
  );

CREATE OR REPLACE FUNCTION public.update_open_task_count()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  IF NEW.assigned_to IS NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' AND OLD.status IS DISTINCT FROM NEW.status THEN
    IF NEW.status IN ('completed', 'cancelled') AND OLD.status NOT IN ('completed', 'cancelled') THEN
      UPDATE public.users
      SET open_task_count = GREATEST(open_task_count - 1, 0),
          updated_at = now()
      WHERE id = NEW.assigned_to;
    ELSIF OLD.status IN ('completed', 'cancelled') AND NEW.status NOT IN ('completed', 'cancelled') THEN
      UPDATE public.users
      SET open_task_count = open_task_count + 1,
          updated_at = now()
      WHERE id = NEW.assigned_to;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS task_status_change ON public.tasks;
CREATE TRIGGER task_status_change
AFTER UPDATE OF status ON public.tasks
FOR EACH ROW
EXECUTE FUNCTION public.update_open_task_count();

COMMIT;
