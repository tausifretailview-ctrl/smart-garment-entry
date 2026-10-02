-- Customer app (customer-app edge function): durable login rate limits.
-- Login is by mobile number only, so every attempt (matched or not) is recorded
-- and counted per IP, per shop+mobile and per shop before a session is issued.
-- Service role only: RLS on, no policies. Apply BEFORE deploying customer-app;
-- without this table the function refuses logins (fails closed).

CREATE TABLE IF NOT EXISTS public.customer_app_login_attempts (
  id bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  ip text NOT NULL,
  phone_last10 text NOT NULL,
  success boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_app_login_attempts ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.customer_app_login_attempts FROM anon, authenticated;

CREATE INDEX IF NOT EXISTS customer_app_login_attempts_ip_idx
  ON public.customer_app_login_attempts (ip, created_at);
CREATE INDEX IF NOT EXISTS customer_app_login_attempts_org_phone_idx
  ON public.customer_app_login_attempts (organization_id, phone_last10, created_at);
CREATE INDEX IF NOT EXISTS customer_app_login_attempts_org_failed_idx
  ON public.customer_app_login_attempts (organization_id, created_at)
  WHERE success = false;
