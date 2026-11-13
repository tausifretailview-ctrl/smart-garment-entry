-- SECURITY (Plan Phase 4, C4): two SECURITY DEFINER readers that take a list of record ids
-- and no shop id, so neither the 27 Sep 2026 guard pass (20261231120100) nor the re-guard
-- (20270211120000) touched them. Both skip Row Level Security, so a logged-in user of one
-- shop who had ids from another shop could read that shop's bill totals / stock history.
--
--   get_sale_items_gross_batch(p_sale_ids)        -> line totals per bill
--   get_stock_at_time_batch(p_variant_ids, ts)    -> stock of a product at a point in time
--
-- Each now returns only rows of shops the caller belongs to. Same arguments, same columns,
-- same numbers for the caller's own shop, so the app needs no change.
--
-- WHO STILL SEES EVERYTHING: SQL editor / pg_cron (no API role), service_role (edge
-- functions), platform_admin. Anonymous callers: nothing (as before for stock).
--
-- Read-only change (no data written). Safe to re-run.

CREATE OR REPLACE FUNCTION public._caller_org_scope()
RETURNS TABLE(all_orgs boolean, org_ids uuid[])
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) IS NOT DISTINCT FROM NULL
    OR COALESCE(
      NULLIF(current_setting('request.jwt.claim.role', true), ''),
      NULLIF(current_setting('request.jwt.claims', true), '')::jsonb ->> 'role'
    ) = 'service_role'
    OR (auth.uid() IS NOT NULL AND public.has_role(auth.uid(), 'platform_admin'::app_role)),
    CASE WHEN auth.uid() IS NULL THEN ARRAY[]::uuid[]
         ELSE ARRAY(SELECT public.get_user_organization_ids(auth.uid())) END;
$$;

REVOKE ALL ON FUNCTION public._caller_org_scope() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public._caller_org_scope() TO authenticated, service_role;


CREATE OR REPLACE FUNCTION public.get_sale_items_gross_batch(p_sale_ids uuid[])
RETURNS TABLE(sale_id uuid, items_gross numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  WITH scope AS (SELECT * FROM public._caller_org_scope())
  SELECT
    si.sale_id,
    SUM(
      COALESCE(
        NULLIF(si.line_total, 0),
        COALESCE(si.unit_price, 0) * COALESCE(si.quantity, 0),
        COALESCE(si.mrp, 0) * COALESCE(si.quantity, 0)
      )
    )::numeric AS items_gross
  FROM public.sale_items si
  CROSS JOIN scope
  WHERE si.sale_id = ANY (COALESCE(p_sale_ids, ARRAY[]::uuid[]))
    AND si.deleted_at IS NULL
    AND (scope.all_orgs OR si.organization_id = ANY (scope.org_ids))
  GROUP BY si.sale_id;
$$;

COMMENT ON FUNCTION public.get_sale_items_gross_batch(uuid[]) IS
  'Per-sale merchandise face for balance reconcile: prefers Σ line_total, then unit_price×qty, then mrp×qty. Caller''s shops only.';


CREATE OR REPLACE FUNCTION public.get_stock_at_time_batch(
  p_variant_ids uuid[],
  p_timestamp timestamp with time zone
)
RETURNS TABLE(variant_id uuid, stock_at_time integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH scope AS (SELECT * FROM public._caller_org_scope())
  SELECT
    pv.id AS variant_id,
    (
      COALESCE(pv.opening_qty, 0) +
      COALESCE((
        SELECT SUM(sm.quantity)::integer
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id
          AND sm.created_at <= p_timestamp
          AND sm.movement_type <> 'reconciliation'
      ), 0)
    ) AS stock_at_time
  FROM product_variants pv
  CROSS JOIN scope
  WHERE pv.id = ANY(p_variant_ids)
    AND (scope.all_orgs OR pv.organization_id = ANY (scope.org_ids));
$function$;

-- Same callers as before: logged-in users and edge functions, never the anonymous key.
REVOKE ALL ON FUNCTION public.get_sale_items_gross_batch(uuid[]) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.get_stock_at_time_batch(uuid[], timestamp with time zone) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sale_items_gross_batch(uuid[]) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_stock_at_time_batch(uuid[], timestamp with time zone) TO authenticated, service_role;
