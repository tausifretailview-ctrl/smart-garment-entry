-- Field Sales: salesman live location (where each salesman is during work hours).
--
-- Settings > Sale > "Salesman live location" (sale_settings.salesman_tracking):
--   { "enabled": true, "start": "10:00", "end": "20:00" }   (India time)
-- The field sales app sends its position every few minutes during those hours (in the
-- background on the Android app). The owner sees each salesman's area and last-seen time.
--
-- Privacy, enforced here and not only in the app:
--   * points are stored only while the shop has tracking on AND inside its work hours (IST);
--     a phone that keeps sending after hours stores nothing;
--   * only the salesman's own points (auth.uid(), an employee with field sales access);
--   * only the shop's admins and managers can read them;
--   * points older than 7 days are deleted on each send.
-- The table has no direct access; everything goes through the functions below.
--
-- New objects only; safe to run twice. To undo: drop the three functions and the table.

CREATE TABLE IF NOT EXISTS public.salesman_locations (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  lat double precision NOT NULL CHECK (lat BETWEEN -90 AND 90),
  lng double precision NOT NULL CHECK (lng BETWEEN -180 AND 180),
  accuracy_m real,
  recorded_at timestamptz NOT NULL,
  source text NOT NULL DEFAULT 'foreground' CHECK (source IN ('background', 'foreground')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_salesman_locations_org_user_time
  ON public.salesman_locations (organization_id, user_id, recorded_at DESC);

ALTER TABLE public.salesman_locations ENABLE ROW LEVEL SECURITY;
-- No policies: no direct reads or writes from the app. The functions below are the only way in.
REVOKE ALL ON public.salesman_locations FROM PUBLIC, anon, authenticated;
REVOKE ALL ON SEQUENCE public.salesman_locations_id_seq FROM PUBLIC, anon, authenticated;

COMMENT ON TABLE public.salesman_locations IS
  'Field Sales live location points (7 days). Written by record_salesman_locations, read by get_salesman_live_locations / get_salesman_location_trail.';

-- Work hours from settings; minutes after midnight, India time. NULL start/end = off.
CREATE OR REPLACE FUNCTION public._salesman_tracking_hours(p_organization_id uuid)
RETURNS TABLE (start_min integer, end_min integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    CASE WHEN t ->> 'start' ~ '^\d{1,2}:\d{2}$'
         THEN split_part(t ->> 'start', ':', 1)::int * 60 + split_part(t ->> 'start', ':', 2)::int END,
    CASE WHEN t ->> 'end' ~ '^\d{1,2}:\d{2}$'
         THEN split_part(t ->> 'end', ':', 1)::int * 60 + split_part(t ->> 'end', ':', 2)::int END
  FROM (
    SELECT s.sale_settings -> 'salesman_tracking' AS t
    FROM public.settings s
    WHERE s.organization_id = p_organization_id
    LIMIT 1
  ) x
  WHERE (t ->> 'enabled') = 'true';
$$;

REVOKE EXECUTE ON FUNCTION public._salesman_tracking_hours(uuid) FROM PUBLIC, anon, authenticated;

-- The field sales app sends a batch of its own points. Returns how many were kept.
CREATE OR REPLACE FUNCTION public.record_salesman_locations(p_organization_id uuid, p_points jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_start integer;
  v_end integer;
  v_kept integer := 0;
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Login required' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (
    SELECT 1 FROM public.employees e
    WHERE e.organization_id = p_organization_id AND e.user_id = v_uid
      AND e.field_sales_access = true AND e.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Only field sales users send their location' USING ERRCODE = '42501';
  END IF;

  SELECT h.start_min, h.end_min INTO v_start, v_end
  FROM public._salesman_tracking_hours(p_organization_id) h;

  IF v_start IS NOT NULL AND v_end IS NOT NULL AND jsonb_typeof(p_points) = 'array' THEN
    INSERT INTO public.salesman_locations (organization_id, user_id, lat, lng, accuracy_m, recorded_at, source)
    SELECT p_organization_id, v_uid, x.lat, x.lng, x.accuracy_m, x.recorded_at,
           CASE WHEN x.source = 'background' THEN 'background' ELSE 'foreground' END
    FROM (
      SELECT (pt ->> 'lat')::double precision AS lat,
             (pt ->> 'lng')::double precision AS lng,
             NULLIF(pt ->> 'accuracy', '')::real AS accuracy_m,
             (pt ->> 'at')::timestamptz AS recorded_at,
             pt ->> 'source' AS source
      FROM jsonb_array_elements(p_points) WITH ORDINALITY AS a(pt, n)
      WHERE a.n <= 500
        AND jsonb_typeof(pt -> 'lat') = 'number'
        AND jsonb_typeof(pt -> 'lng') = 'number'
        AND (pt ->> 'at') ~ '^\d{4}-\d{2}-\d{2}T'
    ) x
    WHERE x.lat BETWEEN -90 AND 90 AND x.lng BETWEEN -180 AND 180
      -- recent, not from the future
      AND x.recorded_at > now() - interval '24 hours'
      AND x.recorded_at < now() + interval '5 minutes'
      -- inside the shop's work hours, India time (end after start; no overnight shifts)
      AND (EXTRACT(HOUR FROM x.recorded_at AT TIME ZONE 'Asia/Kolkata')::int * 60
           + EXTRACT(MINUTE FROM x.recorded_at AT TIME ZONE 'Asia/Kolkata')::int)
          BETWEEN v_start AND v_end - 1;
    GET DIAGNOSTICS v_kept = ROW_COUNT;
  END IF;

  -- Keep 7 days.
  DELETE FROM public.salesman_locations
  WHERE organization_id = p_organization_id AND user_id = v_uid
    AND recorded_at < now() - interval '7 days';

  RETURN v_kept;
END;
$$;

-- Owner view: every field sales user, with their latest point of the last 7 days.
CREATE OR REPLACE FUNCTION public.get_salesman_live_locations(p_organization_id uuid)
RETURNS TABLE (
  user_id uuid,
  employee_name text,
  lat double precision,
  lng double precision,
  accuracy_m real,
  recorded_at timestamptz,
  source text,
  points_today integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  IF auth.uid() IS NOT NULL
     AND NOT public.has_org_role(auth.uid(), p_organization_id, 'admin'::app_role)
     AND NOT public.has_org_role(auth.uid(), p_organization_id, 'manager'::app_role) THEN
    RAISE EXCEPTION 'Only admins and managers can see salesman locations' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT e.user_id, e.employee_name, last.lat, last.lng, last.accuracy_m, last.recorded_at, last.source,
         COALESCE((
           SELECT count(*)::int FROM public.salesman_locations t
           WHERE t.organization_id = p_organization_id AND t.user_id = e.user_id
             AND t.recorded_at >= date_trunc('day', now() AT TIME ZONE 'Asia/Kolkata') AT TIME ZONE 'Asia/Kolkata'
         ), 0)
  FROM public.employees e
  LEFT JOIN LATERAL (
    SELECT l.lat, l.lng, l.accuracy_m, l.recorded_at, l.source
    FROM public.salesman_locations l
    WHERE l.organization_id = p_organization_id AND l.user_id = e.user_id
    ORDER BY l.recorded_at DESC
    LIMIT 1
  ) last ON true
  WHERE e.organization_id = p_organization_id
    AND e.field_sales_access = true AND e.deleted_at IS NULL AND e.user_id IS NOT NULL
  ORDER BY last.recorded_at DESC NULLS LAST, e.employee_name;
END;
$$;

-- Owner view: one salesman's points on one day (India date), oldest first, at most 2,000.
CREATE OR REPLACE FUNCTION public.get_salesman_location_trail(p_organization_id uuid, p_user_id uuid, p_day date)
RETURNS TABLE (lat double precision, lng double precision, accuracy_m real, recorded_at timestamptz)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  IF auth.uid() IS NOT NULL
     AND NOT public.has_org_role(auth.uid(), p_organization_id, 'admin'::app_role)
     AND NOT public.has_org_role(auth.uid(), p_organization_id, 'manager'::app_role) THEN
    RAISE EXCEPTION 'Only admins and managers can see salesman locations' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT l.lat, l.lng, l.accuracy_m, l.recorded_at
  FROM public.salesman_locations l
  WHERE l.organization_id = p_organization_id AND l.user_id = p_user_id
    AND l.recorded_at >= (p_day::timestamp AT TIME ZONE 'Asia/Kolkata')
    AND l.recorded_at < ((p_day + 1)::timestamp AT TIME ZONE 'Asia/Kolkata')
  ORDER BY l.recorded_at
  LIMIT 2000;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.record_salesman_locations(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_salesman_locations(uuid, jsonb) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_salesman_live_locations(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salesman_live_locations(uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_salesman_location_trail(uuid, uuid, date) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_salesman_location_trail(uuid, uuid, date) TO authenticated, service_role;
