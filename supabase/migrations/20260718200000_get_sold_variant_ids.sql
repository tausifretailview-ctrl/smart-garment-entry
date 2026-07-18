-- Distinct sold product/variant IDs for Sale Return pickers.
-- Replaces client pagination loops over sale_items × sales (1000-row pages).

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
  'Used by Sale Return product pickers; client caches ~5 min and invalidates on sale save.';

REVOKE ALL ON FUNCTION public.get_sold_variant_ids(uuid) FROM PUBLIC, anon;

GRANT EXECUTE ON FUNCTION public.get_sold_variant_ids(uuid)
  TO authenticated, service_role;
