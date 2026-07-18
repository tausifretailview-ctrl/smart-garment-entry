-- Copy into Supabase SQL editor if Lovable has not applied the migration yet.
-- Source: supabase/migrations/20260718200000_get_sold_variant_ids.sql

CREATE OR REPLACE FUNCTION public.get_sold_variant_ids(p_org_id uuid)
RETURNS TABLE (product_id uuid, variant_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.assert_org_member(p_org_id);

  RETURN QUERY
  SELECT DISTINCT si.product_id, si.variant_id
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE s.organization_id = p_org_id
    AND si.deleted_at IS NULL;
END;
$$;

COMMENT ON FUNCTION public.get_sold_variant_ids(uuid) IS
  'Distinct (product_id, variant_id) from non-deleted sale_items for an org. '
  'Intentionally includes all historically sold items regardless of sale_return status '
  '(same as the old client pagination loops). Sale-return save need not invalidate this; '
  'client caches ~5 min and invalidates on sale save/delete via ["sold-variant-ids"].';

REVOKE ALL ON FUNCTION public.get_sold_variant_ids(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_sold_variant_ids(uuid)
  TO authenticated, service_role;

-- ---- Parity check (replace ORG_UUID) ----
-- WITH loop_equiv AS (
--   SELECT DISTINCT si.product_id, si.variant_id
--   FROM public.sale_items si
--   JOIN public.sales s ON s.id = si.sale_id
--   WHERE s.organization_id = 'ORG_UUID'::uuid
--     AND si.deleted_at IS NULL
-- ),
-- rpc_set AS (
--   SELECT product_id, variant_id FROM public.get_sold_variant_ids('ORG_UUID'::uuid)
-- )
-- SELECT
--   (SELECT count(*) FROM loop_equiv) AS loop_pair_count,
--   (SELECT count(*) FROM rpc_set) AS rpc_pair_count,
--   (SELECT count(*) FROM (SELECT * FROM loop_equiv EXCEPT SELECT * FROM rpc_set) d) AS only_in_loop,
--   (SELECT count(*) FROM (SELECT * FROM rpc_set EXCEPT SELECT * FROM loop_equiv) d) AS only_in_rpc;

-- ---- EXPLAIN ANALYZE (replace ORG_UUID) ----
-- EXPLAIN (ANALYZE, BUFFERS)
-- SELECT DISTINCT si.product_id, si.variant_id
-- FROM public.sale_items si
-- JOIN public.sales s ON s.id = si.sale_id
-- WHERE s.organization_id = 'ORG_UUID'::uuid
--   AND si.deleted_at IS NULL;
