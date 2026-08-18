-- Nightly auto-backup has been 403ing since the dispatch-secret migration:
-- cron sent current_setting('app.backup_dispatch_secret', true) which is empty until a
-- platform admin sets BOTH the GUC and the Edge Function secret to the same 32+ char value.
--
-- Fix: pg_cron mints a one-time ticket in-database and scheduled-backup consumes it.
-- No Edge Function secret is required for the 11:00 PM IST run.
-- BACKUP_DISPATCH_SECRET remains an optional extra path.
--
-- Also clamp backup retention so a 0-day setting cannot delete every backup log.

CREATE TABLE IF NOT EXISTS public.backup_dispatch_tickets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  token text NOT NULL,
  expires_at timestamptz NOT NULL,
  used_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.backup_dispatch_tickets ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON TABLE public.backup_dispatch_tickets FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.backup_dispatch_tickets TO service_role;

COMMENT ON TABLE public.backup_dispatch_tickets IS
  'One-time short-lived tickets so pg_cron can invoke scheduled-backup without BACKUP_DISPATCH_SECRET.';

CREATE OR REPLACE FUNCTION public.consume_backup_dispatch_ticket(p_id uuid, p_token text)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_ok boolean;
BEGIN
  IF auth.role() IS DISTINCT FROM 'service_role' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  IF p_id IS NULL OR p_token IS NULL OR length(p_token) <> 64 THEN
    RETURN false;
  END IF;

  UPDATE public.backup_dispatch_tickets
  SET used_at = now()
  WHERE id = p_id
    AND used_at IS NULL
    AND expires_at > now()
    AND token = p_token
  RETURNING true INTO v_ok;

  RETURN COALESCE(v_ok, false);
END;
$$;

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
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_url := current_setting('app.supabase_url', true);
  v_anon := current_setting('app.supabase_anon_key', true);
  IF v_url IS NULL OR v_url = '' OR v_anon IS NULL OR v_anon = '' THEN
    RAISE EXCEPTION 'app.supabase_url / app.supabase_anon_key are not configured';
  END IF;

  DELETE FROM public.backup_dispatch_tickets
  WHERE expires_at < now() - interval '1 hour';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.backup_dispatch_tickets (token, expires_at)
  VALUES (v_token, now() + interval '10 minutes')
  RETURNING id INTO v_id;

  v_secret := NULLIF(current_setting('app.backup_dispatch_secret', true), '');

  SELECT net.http_post(
    url := v_url || '/functions/v1/scheduled-backup',
    headers := jsonb_strip_nulls(jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-internal-dispatch-secret', v_secret,
      'x-backup-dispatch-ticket', v_id::text || ':' || v_token
    )),
    body := '{}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.consume_backup_dispatch_ticket(uuid, text) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.consume_backup_dispatch_ticket(uuid, text) TO service_role;

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

  v_days := GREATEST(COALESCE(NULLIF(p_days, 0), 30), 7);
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
    SELECT s.organization_id,
           GREATEST(COALESCE(NULLIF(s.backup_retention_days, 0), 30), 7) AS days
    FROM public.settings s
    WHERE s.auto_backup_enabled = true
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

SELECT cron.schedule(
  'daily-scheduled-backup',
  '30 17 * * *',
  $$ SELECT public.dispatch_nightly_backups(); $$
);
