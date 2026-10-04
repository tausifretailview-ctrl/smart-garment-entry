-- Owner alerts cron (owner-alerts-every-15-min) raised
--   "app.supabase_url / app.supabase_anon_key are not configured"
-- every 15 minutes once any organisation turned alerts on: hosted Supabase
-- blocks ALTER DATABASE SET app.* (42501), so those settings never exist.
-- Use the same project URL / publishable anon key fallback as
-- dispatch_nightly_backups (20260913173000). The one-time ticket still
-- authorises the call; the anon key is the public publishable key.

CREATE OR REPLACE FUNCTION public.dispatch_owner_alerts()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_token text;
  v_request_id bigint;
  v_url text;
  v_anon text;
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Skip the HTTP call entirely while no organization has alerts on.
  IF NOT EXISTS (SELECT 1 FROM public.owner_alert_settings WHERE enabled) THEN
    RETURN NULL;
  END IF;

  v_url := NULLIF(current_setting('app.supabase_url', true), '');
  v_anon := NULLIF(current_setting('app.supabase_anon_key', true), '');

  IF v_url IS NULL THEN
    v_url := 'https://lkbbrqcsbhqjvsxiorvp.supabase.co';
  END IF;
  IF v_anon IS NULL THEN
    v_anon := 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImxrYmJycWNzYmhxanZzeGlvcnZwIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjI0NTAyMzIsImV4cCI6MjA3ODAyNjIzMn0.DkxBeR40bFS06Ea9TZcQ9KTuSgik5akoiQFv5mye4ts';
  END IF;

  DELETE FROM public.backup_dispatch_tickets
  WHERE expires_at < now() - interval '1 hour';

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.backup_dispatch_tickets (token, expires_at)
  VALUES (v_token, now() + interval '10 minutes')
  RETURNING id INTO v_id;

  SELECT net.http_post(
    url := v_url || '/functions/v1/owner-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'apikey', v_anon,
      'x-backup-dispatch-ticket', v_id::text || ':' || v_token
    ),
    body := '{"type":"scheduled"}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_owner_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_owner_alerts() TO postgres;
