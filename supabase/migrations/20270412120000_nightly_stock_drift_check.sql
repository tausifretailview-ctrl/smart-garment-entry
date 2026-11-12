-- Nightly stock check for every shop.
--
-- Stock is a stored number per product size (product_variants.stock_qty) that many
-- code paths adjust. _get_stock_reconciliation_rows already recomputes it from the
-- documents (opening + purchases - sales - purchase returns + sale returns - pending
-- challans +/- transfers) and is kept current as new stock features are added, but
-- nothing ran it automatically: phantom units from an unreversed purchase bill went
-- unnoticed for about 4 months (docs/stock-movement-drift-2026-07.md).
--
-- This adds:
--   * stock_drift_runs: one row per shop per run, with the count of sizes whose stored
--     stock differs from the recompute and the 20 largest differences.
--   * run_nightly_stock_drift_check(org): read-only scan; writes only stock_drift_runs.
--   * get_latest_stock_drift(): the latest run per shop, for Platform Admin.
--   * pg_cron job at 21:30 UTC (03:00 IST), after the 02:30 IST CN drift check.
--
-- Nothing here changes stock. Runs older than 90 days are deleted by the job.

CREATE TABLE IF NOT EXISTS public.stock_drift_runs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at timestamptz NOT NULL DEFAULT now(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  variants_checked integer NOT NULL DEFAULT 0,
  drift_variants integer NOT NULL DEFAULT 0,
  drift_units numeric NOT NULL DEFAULT 0,
  top_drift jsonb NOT NULL DEFAULT '[]'::jsonb,
  duration_ms integer,
  error text
);

COMMENT ON TABLE public.stock_drift_runs IS
  'Nightly stock check: stored stock_qty vs recompute from documents, per shop. drift_units = sum of absolute differences.';

CREATE INDEX IF NOT EXISTS stock_drift_runs_org_run_idx
  ON public.stock_drift_runs (organization_id, run_at DESC);
CREATE INDEX IF NOT EXISTS stock_drift_runs_run_idx
  ON public.stock_drift_runs (run_at DESC);

ALTER TABLE public.stock_drift_runs ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON TABLE public.stock_drift_runs FROM PUBLIC, anon, authenticated;
GRANT ALL ON TABLE public.stock_drift_runs TO service_role;

-- Read-only scan. Each shop runs in its own sub-transaction so one failure (for
-- example a very large shop) is recorded and the rest still run.
CREATE OR REPLACE FUNCTION public.run_nightly_stock_drift_check(p_organization_id uuid DEFAULT NULL)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
SET statement_timeout = '20min'
AS $$
DECLARE
  v_org record;
  v_started timestamptz;
  v_checked integer;
  v_drift integer;
  v_units numeric;
  v_top jsonb;
  v_orgs integer := 0;
BEGIN
  -- The cron job runs with no signed-in user. A signed-in caller must be a platform admin.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  FOR v_org IN
    SELECT o.id
    FROM public.organizations o
    WHERE o.is_suspended IS DISTINCT FROM true
      AND (p_organization_id IS NULL OR o.id = p_organization_id)
    ORDER BY o.id
  LOOP
    v_started := clock_timestamp();
    BEGIN
      WITH r AS (
        SELECT out_variant_id, out_barcode, out_product_name, out_size,
               out_stored_stock_qty, out_recomputed_stock_qty, out_drift
        FROM public._get_stock_reconciliation_rows(v_org.id)
      )
      SELECT
        count(*)::integer,
        (count(*) FILTER (WHERE abs(out_drift) > 0.0001))::integer,
        COALESCE(sum(abs(out_drift)) FILTER (WHERE abs(out_drift) > 0.0001), 0),
        COALESCE((
          SELECT jsonb_agg(t.row_json ORDER BY t.abs_drift DESC)
          FROM (
            SELECT
              abs(x.out_drift) AS abs_drift,
              jsonb_build_object(
                'variant_id', x.out_variant_id,
                'barcode', x.out_barcode,
                'product_name', x.out_product_name,
                'size', x.out_size,
                'stored', x.out_stored_stock_qty,
                'recomputed', x.out_recomputed_stock_qty,
                'drift', x.out_drift
              ) AS row_json
            FROM r x
            WHERE abs(x.out_drift) > 0.0001
            ORDER BY abs(x.out_drift) DESC
            LIMIT 20
          ) t
        ), '[]'::jsonb)
      INTO v_checked, v_drift, v_units, v_top
      FROM r;

      INSERT INTO public.stock_drift_runs
        (organization_id, variants_checked, drift_variants, drift_units, top_drift, duration_ms)
      VALUES
        (v_org.id, v_checked, v_drift, v_units, v_top,
         (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer);
    EXCEPTION WHEN OTHERS THEN
      INSERT INTO public.stock_drift_runs (organization_id, duration_ms, error)
      VALUES (v_org.id,
              (extract(epoch FROM clock_timestamp() - v_started) * 1000)::integer,
              left(SQLERRM, 1000));
    END;
    v_orgs := v_orgs + 1;
  END LOOP;

  IF p_organization_id IS NULL THEN
    DELETE FROM public.stock_drift_runs WHERE run_at < now() - interval '90 days';
  END IF;

  RETURN v_orgs;
END;
$$;

REVOKE ALL ON FUNCTION public.run_nightly_stock_drift_check(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.run_nightly_stock_drift_check(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_nightly_stock_drift_check(uuid) TO authenticated;

COMMENT ON FUNCTION public.run_nightly_stock_drift_check(uuid) IS
  'Read-only: records stored stock vs document recompute per shop in stock_drift_runs. Cron (no user) or platform admin.';

-- Latest run per shop, worst first. Platform admins only.
CREATE OR REPLACE FUNCTION public.get_latest_stock_drift()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  run_at timestamptz,
  variants_checked integer,
  drift_variants integer,
  drift_units numeric,
  previous_drift_variants integer,
  top_drift jsonb,
  duration_ms integer,
  error text
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
  WITH ranked AS (
    SELECT s.*,
           row_number() OVER (PARTITION BY s.organization_id ORDER BY s.run_at DESC) AS rn
    FROM public.stock_drift_runs s
    WHERE s.run_at > now() - interval '30 days'
  )
  SELECT
    cur.organization_id,
    o.name::text,
    cur.run_at,
    cur.variants_checked,
    cur.drift_variants,
    cur.drift_units,
    prev.drift_variants,
    cur.top_drift,
    cur.duration_ms,
    cur.error
  FROM ranked cur
  JOIN public.organizations o ON o.id = cur.organization_id
  LEFT JOIN ranked prev ON prev.organization_id = cur.organization_id AND prev.rn = 2
  WHERE cur.rn = 1
  ORDER BY (cur.error IS NOT NULL) DESC, cur.drift_variants DESC, o.name;
END;
$$;

REVOKE ALL ON FUNCTION public.get_latest_stock_drift() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_latest_stock_drift() TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('nightly-stock-drift-check');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

-- Outer block uses its own quote tag: a $$ job body inside a DO $$ block ends the block
-- early and the whole statement fails to parse, so the job would never be scheduled.
DO $do$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'nightly-stock-drift-check',
      '30 21 * * *',
      $job$SELECT public.run_nightly_stock_drift_check(NULL);$job$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule nightly-stock-drift-check skipped: %', SQLERRM;
END;
$do$;
