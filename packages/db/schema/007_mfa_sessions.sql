BEGIN;

ALTER TABLE public.users
  ADD COLUMN IF NOT EXISTS mfa_enabled BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS mfa_secret TEXT;

CREATE TABLE IF NOT EXISTS public.sessions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  session_token_hash TEXT NOT NULL UNIQUE,
  device TEXT,
  browser TEXT,
  ip TEXT,
  country TEXT,
  revoked BOOLEAN NOT NULL DEFAULT false,
  last_active TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS sessions_select_own ON public.sessions;
CREATE POLICY sessions_select_own ON public.sessions
  FOR SELECT USING (user_id = auth.uid());

DROP POLICY IF EXISTS sessions_select_exec_all ON public.sessions;
CREATE POLICY sessions_select_exec_all ON public.sessions
  FOR SELECT USING (
    EXISTS (
      SELECT 1 FROM public.users u
      WHERE u.id = auth.uid() AND u.role IN ('ceo', 'cfo')
    )
  );

DROP POLICY IF EXISTS sessions_update_own ON public.sessions;
CREATE POLICY sessions_update_own ON public.sessions
  FOR UPDATE USING (user_id = auth.uid());

DROP INDEX IF EXISTS idx_sessions_user_id;
DROP INDEX IF EXISTS idx_sessions_token_hash;
DROP INDEX IF EXISTS idx_sessions_active;
CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON public.sessions(user_id);
CREATE INDEX IF NOT EXISTS idx_sessions_token_hash ON public.sessions(session_token_hash);
CREATE INDEX IF NOT EXISTS idx_sessions_active ON public.sessions(user_id, revoked, last_active DESC);

COMMIT;