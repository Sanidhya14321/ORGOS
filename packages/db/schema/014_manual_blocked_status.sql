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
  ELSIF TG_OP = 'UPDATE'
    AND COALESCE(OLD.blocked_by_count, 0) > 0
    AND NEW.blocked_by_count = 0
    AND NEW.status = 'blocked' THEN
    NEW.status := 'pending';
  END IF;

  RETURN NEW;
END;
$$;
