-- Structured error log for observability
CREATE TABLE IF NOT EXISTS public.app_error_logs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  page_path text,
  operation text NOT NULL,
  error_message text NOT NULL,
  error_stack text,
  error_code text,
  browser_info jsonb,
  additional_context jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_error_logs_org_time
  ON public.app_error_logs (organization_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_time
  ON public.app_error_logs (created_at DESC);

CREATE INDEX IF NOT EXISTS idx_error_logs_operation
  ON public.app_error_logs (operation, created_at DESC);

ALTER TABLE public.app_error_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "authenticated_insert_errors" ON public.app_error_logs;
CREATE POLICY "authenticated_insert_errors"
ON public.app_error_logs FOR INSERT
TO authenticated
WITH CHECK (user_id = auth.uid());

DROP POLICY IF EXISTS "org_or_own_select_errors" ON public.app_error_logs;
CREATE POLICY "org_or_own_select_errors"
ON public.app_error_logs FOR SELECT
TO authenticated
USING (
  (organization_id IS NOT NULL AND organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  OR user_id = auth.uid()
);

-- Auto-purge logs older than 90 days via pg_cron if available
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'purge-old-error-logs',
      '0 3 * * *',
      $cron$ DELETE FROM public.app_error_logs WHERE created_at < now() - interval '90 days'; $cron$
    );
  END IF;
END $outer$;