-- Remove old cron job if it exists (ignore error if not found)
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-backup');
EXCEPTION WHEN OTHERS THEN
  -- job doesn't exist, ignore
END;
$$;

-- Schedule daily backup at 11:00 PM IST = 17:30 UTC
SELECT cron.schedule(
  'scheduled-backup',
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

-- Enable daily auto-backup by default for all existing orgs
UPDATE settings
SET auto_backup_enabled = true
WHERE auto_backup_enabled = false OR auto_backup_enabled IS NULL;

-- Set default to true for new orgs going forward
ALTER TABLE settings
ALTER COLUMN auto_backup_enabled SET DEFAULT true;