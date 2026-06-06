
-- ============================================================
-- Phase 2C: Log retention archive system
-- Moves old rows from live log tables into *_archive tables
-- nightly. No hard deletes — full history is preserved.
-- ============================================================

-- Ensure pg_cron is available
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- 1. AUDIT LOGS ARCHIVE -------------------------------------------------
CREATE TABLE IF NOT EXISTS public.audit_logs_archive (
  id              uuid PRIMARY KEY,
  created_at      timestamptz,
  user_id         uuid,
  user_email      text,
  action          text NOT NULL,
  entity_type     text NOT NULL,
  entity_id       uuid,
  old_values      jsonb,
  new_values      jsonb,
  metadata        jsonb,
  ip_address      text,
  user_agent      text,
  organization_id uuid,
  archived_at     timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.audit_logs_archive TO service_role;
-- intentionally NO grants to anon / authenticated — admin-only via service_role

ALTER TABLE public.audit_logs_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "audit_logs_archive_no_client_access" ON public.audit_logs_archive;
CREATE POLICY "audit_logs_archive_no_client_access"
  ON public.audit_logs_archive
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_audit_logs_archive_org_created
  ON public.audit_logs_archive (organization_id, created_at DESC);

-- 2. WHATSAPP LOGS ARCHIVE ---------------------------------------------
CREATE TABLE IF NOT EXISTS public.whatsapp_logs_archive (
  id                uuid PRIMARY KEY,
  organization_id   uuid NOT NULL,
  phone_number      text NOT NULL,
  message           text,
  template_name     text,
  template_type     text NOT NULL,
  status            text NOT NULL,
  wamid             text,
  reference_id      uuid,
  reference_type    text,
  provider_response jsonb,
  error_message     text,
  sent_at           timestamptz,
  delivered_at      timestamptz,
  read_at           timestamptz,
  created_at        timestamptz NOT NULL,
  pending_followup  boolean,
  followup_data     jsonb,
  archived_at       timestamptz NOT NULL DEFAULT now()
);

GRANT ALL ON public.whatsapp_logs_archive TO service_role;

ALTER TABLE public.whatsapp_logs_archive ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "whatsapp_logs_archive_no_client_access" ON public.whatsapp_logs_archive;
CREATE POLICY "whatsapp_logs_archive_no_client_access"
  ON public.whatsapp_logs_archive
  FOR ALL
  TO authenticated
  USING (false)
  WITH CHECK (false);

CREATE INDEX IF NOT EXISTS idx_whatsapp_logs_archive_org_created
  ON public.whatsapp_logs_archive (organization_id, created_at DESC);

-- 3. ARCHIVE FUNCTIONS --------------------------------------------------
-- Move audit_logs older than N days to the archive in capped batches.
CREATE OR REPLACE FUNCTION public.archive_audit_logs_older_than(_days int DEFAULT 180)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff   timestamptz := now() - make_interval(days => _days);
  v_batch    int := 5000;
  v_max_run  int := 50000;
  v_total    int := 0;
  v_moved    int;
BEGIN
  LOOP
    WITH victims AS (
      SELECT id
      FROM public.audit_logs
      WHERE created_at < v_cutoff
      ORDER BY created_at
      LIMIT v_batch
      FOR UPDATE SKIP LOCKED
    ),
    moved AS (
      DELETE FROM public.audit_logs a
      USING victims v
      WHERE a.id = v.id
      RETURNING a.*
    )
    INSERT INTO public.audit_logs_archive (
      id, created_at, user_id, user_email, action, entity_type, entity_id,
      old_values, new_values, metadata, ip_address, user_agent, organization_id
    )
    SELECT
      id, created_at, user_id, user_email, action, entity_type, entity_id,
      old_values, new_values, metadata, ip_address, user_agent, organization_id
    FROM moved;

    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_total := v_total + v_moved;
    EXIT WHEN v_moved = 0 OR v_total >= v_max_run;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_audit_logs_older_than(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_audit_logs_older_than(int) TO service_role;

-- Move whatsapp_logs older than N days to the archive in capped batches.
CREATE OR REPLACE FUNCTION public.archive_whatsapp_logs_older_than(_days int DEFAULT 90)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cutoff   timestamptz := now() - make_interval(days => _days);
  v_batch    int := 5000;
  v_max_run  int := 50000;
  v_total    int := 0;
  v_moved    int;
BEGIN
  LOOP
    WITH victims AS (
      SELECT id
      FROM public.whatsapp_logs
      WHERE created_at < v_cutoff
      ORDER BY created_at
      LIMIT v_batch
      FOR UPDATE SKIP LOCKED
    ),
    moved AS (
      DELETE FROM public.whatsapp_logs w
      USING victims v
      WHERE w.id = v.id
      RETURNING w.*
    )
    INSERT INTO public.whatsapp_logs_archive (
      id, organization_id, phone_number, message, template_name, template_type,
      status, wamid, reference_id, reference_type, provider_response,
      error_message, sent_at, delivered_at, read_at, created_at,
      pending_followup, followup_data
    )
    SELECT
      id, organization_id, phone_number, message, template_name, template_type,
      status, wamid, reference_id, reference_type, provider_response,
      error_message, sent_at, delivered_at, read_at, created_at,
      pending_followup, followup_data
    FROM moved;

    GET DIAGNOSTICS v_moved = ROW_COUNT;
    v_total := v_total + v_moved;
    EXIT WHEN v_moved = 0 OR v_total >= v_max_run;
  END LOOP;

  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.archive_whatsapp_logs_older_than(int) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.archive_whatsapp_logs_older_than(int) TO service_role;

-- 4. CRON SCHEDULES -----------------------------------------------------
-- IST 02:30 = UTC 21:00 prev day; IST 02:45 = UTC 21:15 prev day
DO $$
BEGIN
  -- Unschedule any prior versions (safe if absent)
  PERFORM cron.unschedule('audit_logs_archive_daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'audit_logs_archive_daily');
  PERFORM cron.unschedule('whatsapp_logs_archive_daily')
    WHERE EXISTS (SELECT 1 FROM cron.job WHERE jobname = 'whatsapp_logs_archive_daily');
END $$;

SELECT cron.schedule(
  'audit_logs_archive_daily',
  '0 21 * * *',
  $$SELECT public.archive_audit_logs_older_than(180);$$
);

SELECT cron.schedule(
  'whatsapp_logs_archive_daily',
  '15 21 * * *',
  $$SELECT public.archive_whatsapp_logs_older_than(90);$$
);
