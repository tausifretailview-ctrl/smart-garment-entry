-- Product Master filter dropdowns: distinct category / product_type without full-table row scans.

CREATE OR REPLACE FUNCTION public.get_product_filter_options(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN json_build_object(
    'categories',
    COALESCE(
      (
        SELECT json_agg(d.category ORDER BY d.category)
        FROM (
          SELECT DISTINCT p.category
          FROM public.products p
          WHERE p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.category IS NOT NULL
        ) AS d
      ),
      '[]'::json
    ),
    'product_types',
    COALESCE(
      (
        SELECT json_agg(d.product_type ORDER BY d.product_type)
        FROM (
          SELECT DISTINCT p.product_type
          FROM public.products p
          WHERE p.organization_id = p_org_id
            AND p.deleted_at IS NULL
            AND p.product_type IS NOT NULL
        ) AS d
      ),
      '[]'::json
    )
  );
END;
$$;

COMMENT ON FUNCTION public.get_product_filter_options(uuid) IS
  'Distinct category and product_type values for Product Master filter dropdowns.';

GRANT EXECUTE ON FUNCTION public.get_product_filter_options(uuid) TO authenticated, service_role;
