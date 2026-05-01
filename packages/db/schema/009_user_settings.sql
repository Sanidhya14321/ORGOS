BEGIN;

-- User preferences and settings
CREATE TABLE IF NOT EXISTS public.user_preferences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL UNIQUE REFERENCES public.users(id) ON DELETE CASCADE,
  theme TEXT NOT NULL DEFAULT 'dark' CHECK (theme IN ('dark', 'light', 'auto')),
  language TEXT NOT NULL DEFAULT 'en' CHECK (language IN ('en', 'es', 'fr', 'de')),
  time_format TEXT NOT NULL DEFAULT '24h' CHECK (time_format IN ('12h', '24h')),
  email_notifications BOOLEAN NOT NULL DEFAULT true,
  task_assigned BOOLEAN NOT NULL DEFAULT true,
  task_updated BOOLEAN NOT NULL DEFAULT true,
  sla_breached BOOLEAN NOT NULL DEFAULT true,
  interview_scheduled BOOLEAN NOT NULL DEFAULT true,
  meeting_digest BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- API keys for user integrations
CREATE TABLE IF NOT EXISTS public.user_api_keys (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES public.users(id) ON DELETE CASCADE,
  key_hash TEXT NOT NULL UNIQUE,
  key_prefix TEXT NOT NULL,
  name TEXT NOT NULL,
  last_used_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at TIMESTAMPTZ,
  UNIQUE(user_id, name)
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_user_preferences_user_id ON public.user_preferences(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_user_id ON public.user_api_keys(user_id);
CREATE INDEX IF NOT EXISTS idx_user_api_keys_key_hash ON public.user_api_keys(key_hash);

-- RLS policies
ALTER TABLE public.user_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY user_preferences_select ON public.user_preferences FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_preferences_insert ON public.user_preferences FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_preferences_update ON public.user_preferences FOR UPDATE USING (user_id = auth.uid());
CREATE POLICY user_preferences_delete ON public.user_preferences FOR DELETE USING (user_id = auth.uid());

CREATE POLICY user_api_keys_select ON public.user_api_keys FOR SELECT USING (user_id = auth.uid());
CREATE POLICY user_api_keys_insert ON public.user_api_keys FOR INSERT WITH CHECK (user_id = auth.uid());
CREATE POLICY user_api_keys_delete ON public.user_api_keys FOR DELETE USING (user_id = auth.uid());

COMMIT;
