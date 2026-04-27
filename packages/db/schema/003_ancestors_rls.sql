BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS ancestors UUID[] NOT NULL DEFAULT '{}';

CREATE OR REPLACE FUNCTION public.compute_user_ancestors(target_reports_to UUID)
RETURNS UUID[]
LANGUAGE plpgsql
AS $$
DECLARE
  parent_id UUID := target_reports_to;
  result UUID[] := '{}';
  safety_counter INT := 0;
BEGIN
  WHILE parent_id IS NOT NULL LOOP
    result := result || parent_id;

    SELECT reports_to INTO parent_id
    FROM public.users
    WHERE id = parent_id;

    safety_counter := safety_counter + 1;
    IF safety_counter > 64 THEN
      EXIT;
    END IF;
  END LOOP;

  RETURN result;
END;
$$;

CREATE OR REPLACE FUNCTION public.users_set_ancestors_before_write()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.ancestors := public.compute_user_ancestors(NEW.reports_to);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_set_ancestors_before_write ON public.users;
CREATE TRIGGER trg_users_set_ancestors_before_write
BEFORE INSERT OR UPDATE OF reports_to
ON public.users
FOR EACH ROW
EXECUTE FUNCTION public.users_set_ancestors_before_write();

CREATE OR REPLACE FUNCTION public.refresh_descendant_ancestors(root_user UUID)
RETURNS VOID
LANGUAGE plpgsql
AS $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    WITH RECURSIVE subtree AS (
      SELECT id, reports_to
      FROM public.users
      WHERE id = root_user
      UNION ALL
      SELECT child.id, child.reports_to
      FROM public.users child
      JOIN subtree parent ON child.reports_to = parent.id
    )
    SELECT id FROM subtree
  LOOP
    UPDATE public.users
    SET ancestors = public.compute_user_ancestors(reports_to)
    WHERE id = rec.id;
  END LOOP;
END;
$$;

CREATE OR REPLACE FUNCTION public.users_refresh_descendants_after_reports_to_change()
RETURNS TRIGGER
LANGUAGE plpgsql
AS $$
BEGIN
  PERFORM public.refresh_descendant_ancestors(NEW.id);
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_users_refresh_descendants_after_reports_to_change ON public.users;
CREATE TRIGGER trg_users_refresh_descendants_after_reports_to_change
AFTER UPDATE OF reports_to
ON public.users
FOR EACH ROW
WHEN (OLD.reports_to IS DISTINCT FROM NEW.reports_to)
EXECUTE FUNCTION public.users_refresh_descendants_after_reports_to_change();

DROP POLICY IF EXISTS tasks_select_manager_dept ON public.tasks;
DROP POLICY IF EXISTS tasks_select_manager_subtree ON public.tasks;
CREATE POLICY tasks_select_manager_subtree ON public.tasks
  FOR SELECT USING (
    EXISTS (
      SELECT 1
      FROM public.users mgr
      JOIN public.users assignee ON assignee.id = public.tasks.assigned_to
      WHERE mgr.id = auth.uid()
        AND mgr.role = 'manager'
        AND (
          assignee.id = mgr.id
          OR assignee.ancestors @> ARRAY[mgr.id]
        )
    )
  );

COMMIT;
