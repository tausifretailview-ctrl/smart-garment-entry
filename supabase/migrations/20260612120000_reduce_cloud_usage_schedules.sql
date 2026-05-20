-- Reduce recurring cloud usage from background jobs.
-- Auto backups remain available, but new organizations must opt in explicitly.
ALTER TABLE public.settings
ALTER COLUMN auto_backup_enabled SET DEFAULT false;

-- Existing organizations keep their current auto_backup_enabled setting.
-- Move the hosted automatic backup fan-out from daily to weekly to reduce
-- repeated full-table reads, edge invocations, and storage writes.
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-backup');
EXCEPTION WHEN OTHERS THEN
  -- Job may not exist in local/dev databases.
  NULL;
END;
$$;

SELECT cron.schedule(
  'scheduled-backup',
  '30 17 * * 0',
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

-- Stock discrepancy detection is useful, but scanning every organization every
-- four hours creates a high baseline read load. Daily keeps alerts fresh enough
-- while cutting scheduled scans by roughly 83%.
DO $$
BEGIN
  PERFORM cron.unschedule('stock-alerts-scan-4h');
EXCEPTION WHEN OTHERS THEN
  -- Job may not exist in local/dev databases.
  NULL;
END;
$$;

DO $$
BEGIN
  PERFORM cron.unschedule('stock-alerts-scan-daily');
EXCEPTION WHEN OTHERS THEN
  -- Job may not exist in local/dev databases.
  NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'stock-alerts-scan-daily',
      '15 18 * * *',
      $cron$ SELECT public.scan_stock_alerts_all_orgs(); $cron$
    );
  END IF;
END $$;
