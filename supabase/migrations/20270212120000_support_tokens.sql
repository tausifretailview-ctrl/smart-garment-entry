-- Support tokens: a shop user raises a doubt / technical issue from Contact Support, gets a token
-- number, and the support-tokens edge function posts it to Ezzy's Technical Support WhatsApp group.
-- Rows are written only by the edge function (service role). Users read their own tokens;
-- platform admins read and update all of them.

CREATE SEQUENCE IF NOT EXISTS public.support_token_no_seq START WITH 1001;

CREATE TABLE IF NOT EXISTS public.support_tokens (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token_no bigint NOT NULL UNIQUE DEFAULT nextval('public.support_token_no_seq'),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE SET NULL,
  organization_name text,
  user_id uuid,
  user_name text,
  user_email text,
  contact_phone text NOT NULL,
  category text NOT NULL DEFAULT 'technical',
  message text NOT NULL,
  page_path text,
  status text NOT NULL DEFAULT 'open',
  whatsapp_status text NOT NULL DEFAULT 'pending',
  whatsapp_error text,
  admin_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  closed_at timestamptz,
  CONSTRAINT support_tokens_status_check CHECK (status IN ('open', 'in_progress', 'closed')),
  CONSTRAINT support_tokens_category_check CHECK (category IN ('doubt', 'technical', 'billing', 'other')),
  CONSTRAINT support_tokens_whatsapp_status_check CHECK (whatsapp_status IN ('pending', 'sent', 'failed', 'not_configured'))
);

CREATE INDEX IF NOT EXISTS idx_support_tokens_created ON public.support_tokens (created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tokens_user ON public.support_tokens (user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_support_tokens_open ON public.support_tokens (status) WHERE status <> 'closed';

ALTER TABLE public.support_tokens ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_tokens_select_own_or_platform" ON public.support_tokens;
CREATE POLICY "support_tokens_select_own_or_platform" ON public.support_tokens
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.has_role(auth.uid(), 'platform_admin'::public.app_role));

DROP POLICY IF EXISTS "support_tokens_update_platform" ON public.support_tokens;
CREATE POLICY "support_tokens_update_platform" ON public.support_tokens
  FOR UPDATE TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

GRANT SELECT, UPDATE ON public.support_tokens TO authenticated;
GRANT ALL ON public.support_tokens TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.support_token_no_seq TO service_role;

-- Which WhatsApp group gets the alerts (one row). Only the edge function and platform admins touch it.
CREATE TABLE IF NOT EXISTS public.support_settings (
  id smallint PRIMARY KEY DEFAULT 1,
  whatsapp_group_jid text,
  whatsapp_group_name text,
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT support_settings_single_row CHECK (id = 1)
);

INSERT INTO public.support_settings (id) VALUES (1) ON CONFLICT (id) DO NOTHING;

ALTER TABLE public.support_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "support_settings_platform" ON public.support_settings;
CREATE POLICY "support_settings_platform" ON public.support_settings
  FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'::public.app_role))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'::public.app_role));

GRANT SELECT, UPDATE ON public.support_settings TO authenticated;
GRANT ALL ON public.support_settings TO service_role;
