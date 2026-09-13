-- Paste into Supabase SQL Editor as postgres (project lkbbrqcsbhqjvsxiorvp).
-- ALTER DATABASE SET app.* is blocked on hosted Supabase (42501). Instead,
-- redefine dispatch_nightly_backups() with publishable URL/anon fallbacks.
-- Does NOT touch stale/retention jobs.

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
  IF auth.role() = 'anon'
     OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_url := NULLIF(current_setting('app.supabase_url', true), '');
  v_anon := NULLIF(current_setting('app.supabase_anon_key', true), '');

  -- Hosted Supabase blocks ALTER DATABASE SET app.*; bake publishable defaults.
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


-- Manual invoke (same function pg_cron calls):
SELECT public.dispatch_nightly_backups() AS request_id;

-- Expect status 'posted' (not the GUC failure):
SELECT id, created_at, status, error_message, http_request_id, ticket_id
FROM public.backup_dispatch_runs
ORDER BY created_at DESC
LIMIT 5;
