-- Mark backup_logs stuck in_progress for over 1 hour as failed.

CREATE OR REPLACE FUNCTION public.mark_stale_backups()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_updated integer;
BEGIN
  UPDATE public.backup_logs
  SET
    status = 'failed',
    error_message = 'marked stale: exceeded 1 hour in_progress',
    completed_at = now()
  WHERE status = 'in_progress'
    AND created_at < now() - interval '1 hour';

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

-- One-time cleanup for existing stuck rows
UPDATE public.backup_logs
SET
  status = 'failed',
  error_message = 'marked stale: exceeded 1 hour in_progress',
  completed_at = now()
WHERE status = 'in_progress'
  AND created_at < now() - interval '1 hour';

DO $$
BEGIN
  PERFORM cron.unschedule('mark-stale-backups');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'mark-stale-backups',
  '15 * * * *',
  $$ SELECT public.mark_stale_backups(); $$
);
