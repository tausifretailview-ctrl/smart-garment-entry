-- User screen time: which screen each user had open, for how long, and how
-- much of that time they were actually working (keyboard / mouse / touch).
-- Shown to admins and managers on Activity Log → Logins & screen time.
--
-- Writes are batched on the client (one RPC every few minutes per open app,
-- plus one on logout / tab hide) and upserted by a client-made row id, so a
-- long visit is one row that grows instead of many heartbeat rows.

CREATE TABLE IF NOT EXISTS public.user_screen_time (
  id uuid PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  user_email text,
  app_session_id uuid NOT NULL,
  screen text NOT NULL,
  started_at timestamptz NOT NULL,
  last_seen_at timestamptz NOT NULL,
  active_seconds integer NOT NULL DEFAULT 0,
  ended_reason text,
  device text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_screen_time_org_started
  ON public.user_screen_time (organization_id, started_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_screen_time_org_user_started
  ON public.user_screen_time (organization_id, user_id, started_at DESC);

ALTER TABLE public.user_screen_time ENABLE ROW LEVEL SECURITY;

-- Only admins / managers of the shop read it (same roles as the Activity Log route).
DROP POLICY IF EXISTS "Admins and managers can view screen time" ON public.user_screen_time;
CREATE POLICY "Admins and managers can view screen time"
ON public.user_screen_time
FOR SELECT
TO authenticated
USING (
  public.has_org_role((SELECT auth.uid()), organization_id, 'admin'::app_role)
  OR public.has_org_role((SELECT auth.uid()), organization_id, 'manager'::app_role)
);

-- No direct client writes; record_user_screen_time() is the only writer.
REVOKE ALL ON public.user_screen_time FROM PUBLIC, anon;
REVOKE INSERT, UPDATE, DELETE ON public.user_screen_time FROM authenticated;
GRANT SELECT ON public.user_screen_time TO authenticated;
GRANT ALL ON public.user_screen_time TO service_role;

CREATE OR REPLACE FUNCTION public.record_user_screen_time(
  p_org_id uuid,
  p_rows jsonb
)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_email text;
  v_count integer;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF p_org_id IS NULL OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(v_uid))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_rows IS NULL OR jsonb_typeof(p_rows) <> 'array' OR jsonb_array_length(p_rows) = 0 THEN
    RETURN 0;
  END IF;
  IF jsonb_array_length(p_rows) > 200 THEN
    RAISE EXCEPTION 'Too many rows' USING ERRCODE = '22023';
  END IF;

  SELECT u.email INTO v_email FROM auth.users u WHERE u.id = v_uid;

  WITH src AS (
    SELECT
      r.id,
      r.app_session_id,
      left(coalesce(nullif(trim(r.screen), ''), 'dashboard'), 120) AS screen,
      least(r.started_at, now()) AS started_at,
      least(greatest(r.last_seen_at, r.started_at), now()) AS last_seen_at,
      left(r.ended_reason, 20) AS ended_reason,
      left(r.device, 20) AS device,
      greatest(coalesce(r.active_seconds, 0), 0) AS active_seconds
    FROM jsonb_to_recordset(p_rows) AS r(
      id uuid,
      app_session_id uuid,
      screen text,
      started_at timestamptz,
      last_seen_at timestamptz,
      active_seconds integer,
      ended_reason text,
      device text
    )
    WHERE r.id IS NOT NULL
      AND r.app_session_id IS NOT NULL
      AND r.started_at IS NOT NULL
      AND r.last_seen_at IS NOT NULL
  )
  INSERT INTO public.user_screen_time AS t (
    id, organization_id, user_id, user_email, app_session_id, screen,
    started_at, last_seen_at, active_seconds, ended_reason, device
  )
  SELECT
    s.id, p_org_id, v_uid, v_email, s.app_session_id, s.screen,
    s.started_at, s.last_seen_at,
    -- Active time can't exceed the time the screen was open.
    least(s.active_seconds, ceil(extract(epoch FROM (s.last_seen_at - s.started_at)))::integer + 60),
    s.ended_reason, s.device
  FROM src s
  ON CONFLICT (id) DO UPDATE
    SET last_seen_at = greatest(t.last_seen_at, excluded.last_seen_at),
        active_seconds = greatest(t.active_seconds, excluded.active_seconds),
        ended_reason = coalesce(excluded.ended_reason, t.ended_reason)
    WHERE t.user_id = v_uid AND t.organization_id = p_org_id;

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

COMMENT ON FUNCTION public.record_user_screen_time(uuid, jsonb) IS
  'Batched upsert of the caller''s own screen visits for Activity Log → Logins & screen time. Max 200 rows per call.';

REVOKE ALL ON FUNCTION public.record_user_screen_time(uuid, jsonb) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.record_user_screen_time(uuid, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.record_user_screen_time(uuid, jsonb) TO authenticated, service_role;

-- Keep 90 days.
SELECT cron.schedule(
  'user-screen-time-purge-daily',
  '30 21 * * *',
  $$ DELETE FROM public.user_screen_time WHERE started_at < now() - interval '90 days'; $$
);
