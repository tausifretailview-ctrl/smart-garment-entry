-- Stock Report filter dropdowns: one round trip instead of paginated full-table client scans.
-- Returns slim product/variant rows for cascading filters + distinct supplier pairs.

CREATE OR REPLACE FUNCTION public.get_stock_report_filter_options(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result json;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT json_build_object(
    'rawProducts', COALESCE((
      SELECT json_agg(
        json_build_object(
          'id', p.id,
          'product_name', p.product_name,
          'brand', p.brand,
          'category', p.category,
          'style', p.style
        )
        ORDER BY p.product_name
      )
      FROM public.products p
      WHERE p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND p.product_type IS DISTINCT FROM 'service'
    ), '[]'::json),
    'variantRows', COALESCE((
      SELECT json_agg(
        json_build_object(
          'product_id', pv.product_id,
          'size', pv.size,
          'color', pv.color
        )
      )
      FROM public.product_variants pv
      INNER JOIN public.products p ON p.id = pv.product_id
      WHERE pv.organization_id = p_org_id
        AND pv.deleted_at IS NULL
        AND pv.active = true
        AND p.deleted_at IS NULL
        AND p.product_type IS DISTINCT FROM 'service'
    ), '[]'::json),
    'supplierPairs', COALESCE((
      SELECT json_agg(
        json_build_object(
          'supplier_name', sp.supplier_name,
          'supplier_invoice_no', sp.supplier_invoice_no
        )
      )
      FROM (
        SELECT DISTINCT pb.supplier_name, pb.supplier_invoice_no
        FROM public.purchase_bills pb
        WHERE pb.organization_id = p_org_id
          AND pb.deleted_at IS NULL
      ) sp
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_stock_report_filter_options(uuid) IS
  'Stock Report filter dropdown source data: products, variant size/color rows, supplier pairs (one call).';

GRANT EXECUTE ON FUNCTION public.get_stock_report_filter_options(uuid) TO authenticated, service_role;
