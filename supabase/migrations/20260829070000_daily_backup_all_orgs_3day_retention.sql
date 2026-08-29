-- Nightly cloud backup: every non-suspended organization, every night.
-- Retention floor/default is 3 days (was 7 / 30).
--
-- Also harden cron dispatch:
--   * put the one-time ticket in the POST body as well as the header
--     (pg_net has dropped custom headers in the past → 403 → no backups)
--   * record each cron attempt in backup_dispatch_runs
--   * morning + 11:30 PM IST catch-up jobs so a missed 11:00 PM run recovers
--
-- Nightly backup last completed 17 Aug 2026 for at least one tenant; cron was
-- still gated on settings.auto_backup_enabled and a 7-day retention floor.

CREATE TABLE IF NOT EXISTS public.backup_dispatch_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at timestamptz NOT NULL DEFAULT now(),
  ticket_id uuid,
  http_request_id bigint,
  status text NOT NULL,
  error_message text
);

ALTER TABLE public.backup_dispatch_runs ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.backup_dispatch_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.backup_dispatch_runs TO service_role;

COMMENT ON TABLE public.backup_dispatch_runs IS
  'One row per pg_cron nightly backup dispatch attempt. service_role / postgres only.';

ALTER TABLE public.settings
  ALTER COLUMN auto_backup_enabled SET DEFAULT true;

ALTER TABLE public.settings
  ALTER COLUMN backup_retention_days SET DEFAULT 3;

UPDATE public.settings
SET auto_backup_enabled = true,
    backup_retention_days = 3;

CREATE OR REPLACE FUNCTION public.dispatch_nightly_backups()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_token text;
  v_request_id bigint;
  v_secret text;
  v_url text;
  v_anon text;
  v_ticket text;
BEGIN
  -- Fail closed for interactive roles. postgres / service_role / in-database
  -- (pg_cron) callers have role NULL or service_role / postgres.
  IF auth.role() = 'anon'
     OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_url := current_setting('app.supabase_url', true);
  v_anon := current_setting('app.supabase_anon_key', true);
  IF v_url IS NULL OR v_url = '' OR v_anon IS NULL OR v_anon = '' THEN
    INSERT INTO public.backup_dispatch_runs (status, error_message)
    VALUES ('failed', 'app.supabase_url / app.supabase_anon_key are not configured');
    RAISE EXCEPTION 'app.supabase_url / app.supabase_anon_key are not configured';
  END IF;

  DELETE FROM public.backup_dispatch_tickets
  WHERE expires_at < now() - interval '1 hour';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.backup_dispatch_tickets (token, expires_at)
  VALUES (v_token, now() + interval '10 minutes')
  RETURNING id INTO v_id;

  v_ticket := v_id::text || ':' || v_token;
  v_secret := NULLIF(current_setting('app.backup_dispatch_secret', true), '');

  SELECT net.http_post(
    url := v_url || '/functions/v1/scheduled-backup',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-internal-dispatch-secret', v_secret,
      'x-backup-dispatch-ticket', v_ticket
    )),
    body := jsonb_build_object('ticket', v_ticket)
  ) INTO v_request_id;

  INSERT INTO public.backup_dispatch_runs (ticket_id, http_request_id, status)
  VALUES (v_id, v_request_id, 'posted');

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_nightly_backups() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_nightly_backups() TO postgres;

CREATE OR REPLACE FUNCTION public.purge_old_backup_logs(p_org_id uuid, p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
  v_days integer;
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_days := GREATEST(COALESCE(NULLIF(p_days, 0), 3), 3);
  IF v_days > 3650 THEN
    v_days := 3650;
  END IF;

  DELETE FROM public.backup_logs
  WHERE organization_id = p_org_id
    AND status = 'completed'
    AND created_at < now() - (v_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_all_old_backup_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  r record;
  v_total integer := 0;
  v_org_count integer := 0;
  v_days integer;
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR r IN
    SELECT o.id AS organization_id,
           GREATEST(COALESCE(NULLIF(s.backup_retention_days, 0), 3), 3) AS days
    FROM public.organizations o
    LEFT JOIN public.settings s ON s.organization_id = o.id
    WHERE o.is_suspended IS DISTINCT FROM true
  LOOP
    v_days := r.days;
    IF v_days > 3650 THEN
      v_days := 3650;
    END IF;
    v_total := v_total + public.purge_old_backup_logs(r.organization_id, v_days);
    v_org_count := v_org_count + 1;
  END LOOP;
  RETURN jsonb_build_object('orgs_processed', v_org_count, 'rows_deleted', v_total);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_old_backup_logs(uuid, integer) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.purge_old_backup_logs(uuid, integer) TO service_role;

REVOKE EXECUTE ON FUNCTION public.purge_all_old_backup_logs() FROM PUBLIC, anon, authenticated;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-scheduled-backup');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-scheduled-backup-retry');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('daily-scheduled-backup-morning');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- 11:00 PM IST
SELECT cron.schedule(
  'daily-scheduled-backup',
  '30 17 * * *',
  $$ SELECT public.dispatch_nightly_backups(); $$
);

-- 11:30 PM IST catch-up (same function; orgs backed up in the last 24h are skipped)
SELECT cron.schedule(
  'daily-scheduled-backup-retry',
  '0 18 * * *',
  $$ SELECT public.dispatch_nightly_backups(); $$
);

-- 8:00 AM IST morning catch-up so a missed night still runs the next morning
SELECT cron.schedule(
  'daily-scheduled-backup-morning',
  '30 2 * * *',
  $$ SELECT public.dispatch_nightly_backups(); $$
);
