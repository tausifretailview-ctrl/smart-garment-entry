-- =============================================================================
-- Post-fix snapshot_all timing (postgres / Lovable SQL editor)
-- Edit org_id. Run after 20261127120000 migration applied.
-- =============================================================================

SET statement_timeout = '120s';

-- Wall-clock (NOTICE)
DO $$
DECLARE
  t0 timestamptz := clock_timestamp();
  n bigint;
  v_org uuid := '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid;  -- ← EDIT
BEGIN
  SELECT COUNT(*) INTO n
  FROM public.get_customer_financial_snapshot_all(v_org);
  RAISE NOTICE 'org=% rows=% elapsed_ms=%',
    v_org, n,
    ROUND(extract(epoch FROM (clock_timestamp() - t0)) * 1000);
END $$;

-- Plan + actual time (select org block only for EXPLAIN)
EXPLAIN (ANALYZE, BUFFERS)
SELECT *
FROM public.get_customer_financial_snapshot_all(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid  -- ← EDIT
);
