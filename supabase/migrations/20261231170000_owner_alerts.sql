-- Owner alerts on the Android app: cashier report every 2-3 hours, low stock,
-- invoice alerts and a day-end summary, sent by the `owner-alerts` edge function.
-- Additive only: new tables, one dispatcher function and one cron job. Nothing is
-- sent until an organization turns alerts on (owner_alert_settings.enabled).

-- 1. Phones that receive owner alerts (one row per FCM token).
CREATE TABLE IF NOT EXISTS public.owner_push_devices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  fcm_token text NOT NULL,
  platform text NOT NULL DEFAULT 'android',
  device_label text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'inactive')),
  inactive_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  last_seen_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, fcm_token)
);

CREATE INDEX IF NOT EXISTS owner_push_devices_org_active_idx
  ON public.owner_push_devices (organization_id) WHERE status = 'active';

ALTER TABLE public.owner_push_devices ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_push_devices_select_own ON public.owner_push_devices;
CREATE POLICY owner_push_devices_select_own ON public.owner_push_devices
  FOR SELECT TO authenticated
  USING (
    organization_id IN (SELECT public.get_user_organization_ids((select auth.uid())))
  );

DROP POLICY IF EXISTS owner_push_devices_insert_own ON public.owner_push_devices;
CREATE POLICY owner_push_devices_insert_own ON public.owner_push_devices
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = (select auth.uid())
    AND organization_id IN (SELECT public.get_user_organization_ids((select auth.uid())))
  );

DROP POLICY IF EXISTS owner_push_devices_update_own ON public.owner_push_devices;
CREATE POLICY owner_push_devices_update_own ON public.owner_push_devices
  FOR UPDATE TO authenticated
  USING (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));

DROP POLICY IF EXISTS owner_push_devices_delete_own_or_admin ON public.owner_push_devices;
CREATE POLICY owner_push_devices_delete_own_or_admin ON public.owner_push_devices
  FOR DELETE TO authenticated
  USING (
    user_id = (select auth.uid())
    OR public.has_org_role((select auth.uid()), organization_id, 'admin'::public.app_role)
  );

-- 2. Per-organization alert settings (admins edit; members read).
CREATE TABLE IF NOT EXISTS public.owner_alert_settings (
  organization_id uuid PRIMARY KEY REFERENCES public.organizations(id) ON DELETE CASCADE,
  enabled boolean NOT NULL DEFAULT false,
  cashier_enabled boolean NOT NULL DEFAULT true,
  cashier_every_hours integer NOT NULL DEFAULT 2 CHECK (cashier_every_hours IN (2, 3)),
  shop_open text NOT NULL DEFAULT '10:00',
  shop_close text NOT NULL DEFAULT '22:00',
  low_stock_enabled boolean NOT NULL DEFAULT true,
  low_stock_times text[] NOT NULL DEFAULT ARRAY['10:30', '17:00'],
  low_stock_threshold integer NOT NULL DEFAULT 5 CHECK (low_stock_threshold >= 0),
  invoice_mode text NOT NULL DEFAULT 'off' CHECK (invoice_mode IN ('off', 'all', 'above')),
  invoice_min_amount numeric(15,2) NOT NULL DEFAULT 0,
  day_end_enabled boolean NOT NULL DEFAULT true,
  day_end_time text NOT NULL DEFAULT '22:15',
  updated_at timestamptz NOT NULL DEFAULT now(),
  updated_by uuid
);

ALTER TABLE public.owner_alert_settings ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_alert_settings_select_members ON public.owner_alert_settings;
CREATE POLICY owner_alert_settings_select_members ON public.owner_alert_settings
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids((select auth.uid()))));

DROP POLICY IF EXISTS owner_alert_settings_write_admin ON public.owner_alert_settings;
CREATE POLICY owner_alert_settings_write_admin ON public.owner_alert_settings
  FOR ALL TO authenticated
  USING (public.has_org_role((select auth.uid()), organization_id, 'admin'::public.app_role))
  WITH CHECK (public.has_org_role((select auth.uid()), organization_id, 'admin'::public.app_role));

-- 3. Send log: one row per alert (unique key) so a cron retry never sends twice.
CREATE TABLE IF NOT EXISTS public.owner_push_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  kind text NOT NULL CHECK (kind IN ('cashier', 'low_stock', 'day_end', 'invoice', 'test')),
  ref text NOT NULL,
  sent_count integer NOT NULL DEFAULT 0,
  failed_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (organization_id, kind, ref)
);

ALTER TABLE public.owner_push_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS owner_push_log_select_members ON public.owner_push_log;
CREATE POLICY owner_push_log_select_members ON public.owner_push_log
  FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids((select auth.uid()))));

GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_push_devices TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.owner_alert_settings TO authenticated;
GRANT SELECT ON public.owner_push_log TO authenticated;
GRANT ALL ON public.owner_push_devices, public.owner_alert_settings, public.owner_push_log TO service_role;

-- 4. Dispatcher: pg_cron → owner-alerts, authenticated with a one-time ticket
--    (same ticket table and check as the nightly backup dispatcher).
CREATE OR REPLACE FUNCTION public.dispatch_owner_alerts()
RETURNS bigint
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_token text;
  v_request_id bigint;
  v_url text;
  v_anon text;
BEGIN
  IF auth.role() = 'anon' OR auth.role() = 'authenticated' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  -- Skip the HTTP call entirely while no organization has alerts on.
  IF NOT EXISTS (SELECT 1 FROM public.owner_alert_settings WHERE enabled) THEN
    RETURN NULL;
  END IF;

  v_url := current_setting('app.supabase_url', true);
  v_anon := current_setting('app.supabase_anon_key', true);
  IF v_url IS NULL OR v_url = '' OR v_anon IS NULL OR v_anon = '' THEN
    RAISE EXCEPTION 'app.supabase_url / app.supabase_anon_key are not configured';
  END IF;

  v_token := replace(gen_random_uuid()::text || gen_random_uuid()::text, '-', '');
  INSERT INTO public.backup_dispatch_tickets (token, expires_at)
  VALUES (v_token, now() + interval '10 minutes')
  RETURNING id INTO v_id;

  SELECT net.http_post(
    url := v_url || '/functions/v1/owner-alerts',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_anon,
      'x-backup-dispatch-ticket', v_id::text || ':' || v_token
    ),
    body := '{"type":"scheduled"}'::jsonb
  ) INTO v_request_id;

  RETURN v_request_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.dispatch_owner_alerts() FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.dispatch_owner_alerts() TO postgres;

DO $$
BEGIN
  PERFORM cron.unschedule('owner-alerts-every-15-min');
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

SELECT cron.schedule(
  'owner-alerts-every-15-min',
  '*/15 * * * *',
  $$ SELECT public.dispatch_owner_alerts(); $$
);
