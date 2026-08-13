-- scheduled-backup now requires x-internal-dispatch-secret (BACKUP_DISPATCH_SECRET).
-- Cron must send the same value or nightly backups will 403.
--
-- REQUIRED before/with function deploy (same 32+ char secret):
--   1. Edge Function secret: BACKUP_DISPATCH_SECRET
--   2. Postgres GUC (Dashboard → Postgres settings, or):
--        ALTER DATABASE postgres SET app.backup_dispatch_secret = '<same-secret>';
--
-- Do not commit the secret. missing_ok=true so this migration can apply before the GUC exists;
-- until the GUC is set, cron will call without a usable secret and the function will fail closed.

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
  $$
    SELECT net.http_post(
      url := current_setting('app.supabase_url') || '/functions/v1/scheduled-backup',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || current_setting('app.supabase_anon_key'),
        'x-internal-dispatch-secret', current_setting('app.backup_dispatch_secret', true)
      ),
      body := '{}'::jsonb
    )
  $$
);
