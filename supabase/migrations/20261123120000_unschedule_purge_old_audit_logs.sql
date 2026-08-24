-- Live cron.job (2026-08-24): both jobs are active.
--   purge-audit-logs          15 3 * * *  → SELECT public.purge_old_audit_logs();
--   audit_logs_archive_daily   0 21 * * *  → SELECT public.archive_audit_logs_older_than(180);
--
-- The 45-day hard-delete runs before the 180-day archive, so rows aged 45–180
-- days are destroyed instead of archived. Stop the purge job only. Do not
-- invoke either function here.

DO $$
BEGIN
  PERFORM cron.unschedule('purge-audit-logs');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

-- Belt-and-suspenders: any other job whose command calls the purge function.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT jobid
    FROM cron.job
    WHERE command ILIKE '%purge_old_audit_logs%'
  LOOP
    BEGIN
      PERFORM cron.unschedule(r.jobid);
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
  END LOOP;
END;
$$;
