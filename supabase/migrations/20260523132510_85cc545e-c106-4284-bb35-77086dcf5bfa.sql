-- Cut cloud usage v2: remove duplicate/redundant scheduled jobs and tighten log retention.

-- 1. Remove daily scheduled-backup; keep only weekly-scheduled-backup.
DO $$
BEGIN
  PERFORM cron.unschedule('scheduled-backup');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- 2. Remove leftover 4-hourly stock alerts scan; keep only stock-alerts-scan-daily.
DO $$
BEGIN
  PERFORM cron.unschedule('stock-alerts-scan-4h');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Ensure the daily one is present (idempotent).
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'stock-alerts-scan-daily')
     AND EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'stock-alerts-scan-daily',
      '15 18 * * *',
      $cron$ SELECT public.scan_stock_alerts_all_orgs(); $cron$
    );
  END IF;
END $$;

-- 3. Tighten audit_logs retention 90d -> 45d.
CREATE OR REPLACE FUNCTION public.purge_old_audit_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_candidate_count bigint;
  v_deleted_count bigint;
  v_cutoff timestamptz := now() - interval '45 days';
BEGIN
  SELECT count(*) INTO v_candidate_count
  FROM public.audit_logs
  WHERE created_at < v_cutoff;

  -- Allow larger first-run purge (we are shrinking retention window).
  IF v_candidate_count > 200000 THEN
    INSERT INTO public.app_error_logs (operation, error_message, user_id, additional_context)
    VALUES (
      'audit_log_purge_blocked',
      format('Refused to purge %s audit rows in single run (threshold: 200000). Investigate before re-running.', v_candidate_count),
      NULL,
      jsonb_build_object('candidate_count', v_candidate_count, 'cutoff', v_cutoff)
    );
    RETURN jsonb_build_object('deleted', 0, 'blocked', true, 'candidate_count', v_candidate_count);
  END IF;

  DELETE FROM public.audit_logs WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted_count, 'blocked', false);
END;
$function$;

-- 4. Tighten error log retention 90d -> 30d (re-create cron with new interval).
DO $$
BEGIN
  PERFORM cron.unschedule('purge-old-error-logs');
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

SELECT cron.schedule(
  'purge-old-error-logs',
  '0 3 * * *',
  $$ DELETE FROM public.app_error_logs WHERE created_at < now() - interval '30 days'; $$
);