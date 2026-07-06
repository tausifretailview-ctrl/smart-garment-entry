-- Restore daily auto-backup dispatch at 11:00 PM IST (17:30 UTC).
-- Unschedule both live and legacy cron job names.

DO $$
BEGIN
  PERFORM cron.unschedule('weekly-scheduled-backup');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-backup');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'daily-scheduled-backup',
  '30 17 * * *',
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/scheduled-backup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key')
      ),
      body := '{}'::jsonb
    )
  $$
);
