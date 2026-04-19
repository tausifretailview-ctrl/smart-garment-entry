-- Helper function to purge old backup_logs for an org
CREATE OR REPLACE FUNCTION public.purge_old_backup_logs(p_org_id uuid, p_days integer)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_deleted integer;
BEGIN
  DELETE FROM public.backup_logs
  WHERE organization_id = p_org_id
    AND status = 'completed'
    AND created_at < now() - (p_days || ' days')::interval;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- Backstop: daily purge job at 04:00 UTC for ALL orgs (uses each org's retention setting)
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
BEGIN
  FOR r IN
    SELECT s.organization_id, COALESCE(s.backup_retention_days, 30) AS days
    FROM public.settings s
    WHERE s.auto_backup_enabled = true
  LOOP
    v_total := v_total + public.purge_old_backup_logs(r.organization_id, r.days);
    v_org_count := v_org_count + 1;
  END LOOP;
  RETURN jsonb_build_object('orgs_processed', v_org_count, 'rows_deleted', v_total);
END;
$$;

-- Schedule daily backstop purge at 04:00 UTC
SELECT cron.unschedule('purge-old-backup-logs')
WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'purge-old-backup-logs');

SELECT cron.schedule(
  'purge-old-backup-logs',
  '0 4 * * *',
  $$ SELECT public.purge_all_old_backup_logs(); $$
);