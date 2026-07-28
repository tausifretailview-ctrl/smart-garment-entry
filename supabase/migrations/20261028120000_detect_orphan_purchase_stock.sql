-- Read-only detector: purchase-side movements whose reference_id has no purchase_bills row
-- and whose net purchase-family quantity is still positive (unreversed orphan credit).
-- Validated intent: 0 rows for correctly-reversed orgs; 1 row for VELVET B0326034.

CREATE OR REPLACE FUNCTION public.detect_orphan_purchase_stock(
  p_organization_id uuid DEFAULT NULL
)
RETURNS TABLE (
  organization_id uuid,
  reference_id uuid,
  bill_number text,
  movements bigint,
  net_qty numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    sm.organization_id,
    sm.reference_id,
    max(sm.bill_number) AS bill_number,
    count(*)::bigint AS movements,
    sum(sm.quantity)::numeric AS net_qty
  FROM public.stock_movements sm
  WHERE sm.deleted_at IS NULL
    AND sm.reference_id IS NOT NULL
    AND sm.movement_type IN (
      'purchase',
      'purchase_delete',
      'soft_delete_purchase',
      'purchase_increase',
      'purchase_decrease'
    )
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
    AND (
      auth.uid() IS NULL
      OR sm.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_bills pb
      WHERE pb.id = sm.reference_id
    )
  GROUP BY sm.organization_id, sm.reference_id
  HAVING sum(sm.quantity) > 0.001
  ORDER BY sum(sm.quantity) DESC, max(sm.bill_number);
$$;

COMMENT ON FUNCTION public.detect_orphan_purchase_stock(uuid) IS
  'Purchase movements whose reference_id has no purchase_bills row and net qty still > 0 (unreversed orphan). Pass org id to scope; NULL = all orgs the caller can see.';

GRANT EXECUTE ON FUNCTION public.detect_orphan_purchase_stock(uuid) TO authenticated, service_role;
