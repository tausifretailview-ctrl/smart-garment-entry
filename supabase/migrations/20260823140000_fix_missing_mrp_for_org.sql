-- Set-based backfill: copy product_variants.mrp onto purchase_items with missing MRP.
-- Replaces the client-side per-row loop (Phase 1); cutover in Phase 3 after equivalence check.

CREATE OR REPLACE FUNCTION public.fix_missing_mrp_for_org(p_org_id uuid)
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_updated integer;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for organization %', p_org_id;
  END IF;

  UPDATE public.purchase_items pi
  SET mrp = pv.mrp
  FROM public.product_variants pv
  INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
  WHERE pi.sku_id = pv.id
    AND pb.organization_id = p_org_id
    AND pv.organization_id = p_org_id
    AND (pi.mrp IS NULL OR pi.mrp = 0)
    AND pv.mrp IS NOT NULL
    AND pv.mrp > 0;

  GET DIAGNOSTICS v_updated = ROW_COUNT;
  RETURN v_updated;
END;
$$;

COMMENT ON FUNCTION public.fix_missing_mrp_for_org(uuid) IS
  'Backfill purchase_items.mrp from product_variants.mrp for one org. '
  'Only rows with missing/zero mrp and a variant with mrp > 0 are updated.';

GRANT EXECUTE ON FUNCTION public.fix_missing_mrp_for_org(uuid) TO authenticated;
