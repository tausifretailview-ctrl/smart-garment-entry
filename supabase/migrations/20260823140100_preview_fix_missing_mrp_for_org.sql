-- Phase 2: read-only previews for equivalence check against handleFixMissingMrp loop.

CREATE OR REPLACE FUNCTION public.preview_fix_missing_mrp_for_org(p_org_id uuid)
RETURNS TABLE (
  purchase_item_id uuid,
  current_mrp numeric,
  target_mrp numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for organization %', p_org_id;
  END IF;

  RETURN QUERY
  SELECT
    pi.id,
    pi.mrp,
    pv.mrp
  FROM public.purchase_items pi
  INNER JOIN public.product_variants pv ON pi.sku_id = pv.id
  INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
  WHERE pb.organization_id = p_org_id
    AND pv.organization_id = p_org_id
    AND (pi.mrp IS NULL OR pi.mrp = 0)
    AND pv.mrp IS NOT NULL
    AND pv.mrp > 0;
END;
$$;

COMMENT ON FUNCTION public.preview_fix_missing_mrp_for_org(uuid) IS
  'Dry-run row set for fix_missing_mrp_for_org (no writes). Phase 2 equivalence check.';

GRANT EXECUTE ON FUNCTION public.preview_fix_missing_mrp_for_org(uuid) TO authenticated;


CREATE OR REPLACE FUNCTION public.preview_fix_missing_mrp_cross_org_for_org(p_org_id uuid)
RETURNS TABLE (
  purchase_item_id uuid,
  bill_org_id uuid,
  variant_org_id uuid,
  current_mrp numeric,
  target_mrp numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for organization %', p_org_id;
  END IF;

  RETURN QUERY
  SELECT
    pi.id,
    pb.organization_id,
    pv.organization_id,
    pi.mrp,
    pv.mrp
  FROM public.purchase_items pi
  INNER JOIN public.product_variants pv ON pi.sku_id = pv.id
  INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
  WHERE pb.organization_id = p_org_id
    AND pv.organization_id IS DISTINCT FROM p_org_id
    AND (pi.mrp IS NULL OR pi.mrp = 0)
    AND pv.mrp IS NOT NULL
    AND pv.mrp > 0;
END;
$$;

COMMENT ON FUNCTION public.preview_fix_missing_mrp_cross_org_for_org(uuid) IS
  'Rows the old loop would touch on this org bills but RPC skips (variant belongs to another org).';

GRANT EXECUTE ON FUNCTION public.preview_fix_missing_mrp_cross_org_for_org(uuid) TO authenticated;
