-- Always-on timing of the two waits shops feel most: opening a screen whose code is
-- still downloading ("Opening POS…"), and saving a bill (POS and purchase).
--
-- Until now these were measured only when someone switched on a flag on one PC
-- (ezzy_nav_perf, window.__ezzyPosSave). The app now keeps the numbers in memory and
-- sends them in one small batch every few minutes, alongside screen time.
--
-- Writes go only through record_app_timings() (membership checked, values clamped).
-- Platform admins read get_app_timing_summary(): count, median, 95th percentile and
-- slowest, per shop and measure. Samples older than 60 days are deleted nightly.

CREATE TABLE IF NOT EXISTS public.app_timing_samples (
  id bigserial PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid,
  recorded_at timestamptz NOT NULL DEFAULT now(),
  metric text NOT NULL,
  screen text NOT NULL,
  ms integer NOT NULL,
  detail jsonb,
  device text,
  CONSTRAINT app_timing_samples_metric_chk CHECK (metric IN ('screen_open', 'bill_save')),
  CONSTRAINT app_timing_samples_ms_chk CHECK (ms >= 0 AND ms <= 600000)
);

COMMENT ON TABLE public.app_timing_samples IS
  'Screen-open waits and bill save times sent by the app. Written only by record_app_timings().';

CREATE INDEX IF NOT EXISTS app_timing_samples_org_metric_at_idx
  ON public.app_timing_samples (organization_id, metric, recorded_at DESC);
CREATE INDEX IF NOT EXISTS app_timing_samples_at_idx
  ON public.app_timing_samples (recorded_at);

ALTER TABLE public.app_timing_samples ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.app_timing_samples FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.app_timing_samples TO service_role;
GRANT USAGE, SELECT ON SEQUENCE public.app_timing_samples_id_seq TO service_role;

CREATE OR REPLACE FUNCTION public.record_app_timings(p_org_id uuid, p_rows jsonb)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
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
  IF jsonb_array_length(p_rows) > 100 THEN
    RAISE EXCEPTION 'Too many rows' USING ERRCODE = '22023';
  END IF;

  INSERT INTO public.app_timing_samples (organization_id, user_id, recorded_at, metric, screen, ms, detail, device)
  SELECT
    p_org_id,
    v_uid,
    -- A PC clock can be wrong: keep the client time only when it is within a day of now.
    CASE
      WHEN (r->>'at') ~ '^\d{4}-\d{2}-\d{2}T'
       AND (r->>'at')::timestamptz BETWEEN now() - interval '1 day' AND now() + interval '5 minutes'
      THEN (r->>'at')::timestamptz
      ELSE now()
    END,
    r->>'metric',
    left(r->>'screen', 80),
    LEAST(GREATEST(round((r->>'ms')::numeric)::integer, 0), 600000),
    CASE WHEN jsonb_typeof(r->'detail') = 'object' AND length((r->'detail')::text) <= 2000
         THEN r->'detail' END,
    left(r->>'device', 40)
  FROM jsonb_array_elements(p_rows) AS r
  WHERE r->>'metric' IN ('screen_open', 'bill_save')
    AND coalesce(r->>'screen', '') <> ''
    AND (r->>'ms') ~ '^\d+(\.\d+)?$';

  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;

REVOKE ALL ON FUNCTION public.record_app_timings(uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.record_app_timings(uuid, jsonb) TO authenticated;

CREATE OR REPLACE FUNCTION public.get_app_timing_summary(p_days integer DEFAULT 7)
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  metric text,
  screen text,
  samples bigint,
  median_ms integer,
  p95_ms integer,
  max_ms integer,
  last_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NULL OR NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  SELECT
    s.organization_id,
    o.name::text,
    s.metric,
    s.screen,
    count(*),
    (percentile_cont(0.5) WITHIN GROUP (ORDER BY s.ms))::integer,
    (percentile_cont(0.95) WITHIN GROUP (ORDER BY s.ms))::integer,
    max(s.ms),
    max(s.recorded_at)
  FROM public.app_timing_samples s
  JOIN public.organizations o ON o.id = s.organization_id
  WHERE s.recorded_at > now() - make_interval(days => LEAST(GREATEST(coalesce(p_days, 7), 1), 60))
  GROUP BY s.organization_id, o.name, s.metric, s.screen
  ORDER BY 7 DESC;
END;
$$;

REVOKE ALL ON FUNCTION public.get_app_timing_summary(integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_app_timing_summary(integer) TO authenticated;

-- Nightly clean-up. Separate quote tags: a $$ job body inside DO $$ does not parse.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('app-timing-samples-cleanup');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$do$;

DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'app-timing-samples-cleanup',
      '45 21 * * *',
      $job$DELETE FROM public.app_timing_samples WHERE recorded_at < now() - interval '60 days';$job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule app-timing-samples-cleanup skipped: %', SQLERRM;
END;
$do$;
