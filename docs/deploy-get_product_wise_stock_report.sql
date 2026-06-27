-- =============================================================================
-- Deploy: Item-wise / Product Name Wise Stock Report RPCs
-- Run in Supabase Dashboard → SQL Editor → New query → Paste → Run
-- Source: supabase/migrations/20260911210000_get_product_wise_stock_report.sql
-- =============================================================================

-- Item-wise / Product Name Wise Stock Report: server-side aggregation by group key.
-- Valuation parity with ItemWiseStockReport.tsx: SUM(stock_qty), SUM(pur_price * stock_qty), SUM(sale_price * stock_qty).

CREATE OR REPLACE FUNCTION public.get_product_wise_stock_filter_options(p_org_id uuid)
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
    'brands', COALESCE((
      SELECT json_agg(x.b ORDER BY x.b)
      FROM (
        SELECT DISTINCT p.brand AS b
        FROM public.products p
        WHERE p.organization_id = p_org_id
          AND p.deleted_at IS NULL
          AND p.product_type IS DISTINCT FROM 'service'
          AND p.brand IS NOT NULL
          AND trim(p.brand) <> ''
      ) x
    ), '[]'::json),
    'categories', COALESCE((
      SELECT json_agg(x.c ORDER BY x.c)
      FROM (
        SELECT DISTINCT p.category AS c
        FROM public.products p
        WHERE p.organization_id = p_org_id
          AND p.deleted_at IS NULL
          AND p.product_type IS DISTINCT FROM 'service'
          AND p.category IS NOT NULL
          AND trim(p.category) <> ''
      ) x
    ), '[]'::json),
    'departments', COALESCE((
      SELECT json_agg(x.d ORDER BY x.d)
      FROM (
        SELECT DISTINCT p.style AS d
        FROM public.products p
        WHERE p.organization_id = p_org_id
          AND p.deleted_at IS NULL
          AND p.product_type IS DISTINCT FROM 'service'
          AND p.style IS NOT NULL
          AND trim(p.style) <> ''
      ) x
    ), '[]'::json),
    'suppliers', COALESCE((
      SELECT json_agg(x.s ORDER BY x.s)
      FROM (
        SELECT DISTINCT pb.supplier_name AS s
        FROM public.purchase_bills pb
        WHERE pb.organization_id = p_org_id
          AND pb.deleted_at IS NULL
          AND pb.supplier_name IS NOT NULL
          AND trim(pb.supplier_name) <> ''
      ) x
    ), '[]'::json)
  ) INTO v_result;

  RETURN v_result;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_wise_stock_report_totals(
  p_org_id uuid,
  p_group_by text DEFAULT 'product_name',
  p_search text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_supplier text DEFAULT NULL
)
RETURNS TABLE (
  total_qty bigint,
  purchase_value numeric,
  sale_value numeric,
  group_count bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_group_by text := lower(COALESCE(NULLIF(trim(p_group_by), ''), 'product_name'));
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_brand text := NULLIF(trim(COALESCE(p_brand, '')), '');
  v_category text := NULLIF(trim(COALESCE(p_category, '')), '');
  v_department text := NULLIF(trim(COALESCE(p_department, '')), '');
  v_supplier text := NULLIF(trim(COALESCE(p_supplier, '')), '');
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH variant_supplier AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id AS variant_id,
      pb.supplier_name
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pi.id ASC
  ),
  base_variants AS (
    SELECT
      pv.stock_qty,
      COALESCE(pv.pur_price, 0) AS pur_price,
      pv.sale_price,
      p.product_name,
      p.brand,
      p.category,
      p.style,
      COALESCE(vs.supplier_name, 'Unknown Supplier') AS supplier_name
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN variant_supplier vs ON vs.variant_id = pv.id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND pv.active = true
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND (v_brand IS NULL OR p.brand = v_brand)
      AND (v_category IS NULL OR p.category = v_category)
      AND (v_department IS NULL OR p.style = v_department)
      AND (v_supplier IS NULL OR vs.supplier_name = v_supplier)
      AND (
        v_search IS NULL
        OR v_group_by <> 'product_name'
        OR p.product_name ILIKE '%' || v_search || '%'
      )
  ),
  grouped AS (
    SELECT
      CASE v_group_by
        WHEN 'supplier' THEN bv.supplier_name
        WHEN 'brand' THEN COALESCE(bv.brand, 'No Brand')
        WHEN 'category' THEN COALESCE(bv.category, 'No Category')
        WHEN 'department' THEN COALESCE(bv.style, 'No Department')
        ELSE COALESCE(bv.product_name, 'Unknown')
      END AS group_key,
      COALESCE(SUM(bv.stock_qty), 0)::bigint AS total_stock,
      COALESCE(SUM(bv.pur_price * bv.stock_qty), 0)::numeric AS purchase_value,
      COALESCE(SUM(bv.sale_price * bv.stock_qty), 0)::numeric AS sale_value
    FROM base_variants bv
    GROUP BY 1
  )
  SELECT
    COALESCE(SUM(g.total_stock), 0)::bigint,
    COALESCE(SUM(g.purchase_value), 0)::numeric,
    COALESCE(SUM(g.sale_value), 0)::numeric,
    COUNT(*)::bigint
  FROM grouped g
  WHERE v_search IS NULL
     OR v_group_by = 'product_name'
     OR g.group_key ILIKE '%' || v_search || '%';
END;
$$;

CREATE OR REPLACE FUNCTION public.get_product_wise_stock_report(
  p_org_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_group_by text DEFAULT 'product_name',
  p_search text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_supplier text DEFAULT NULL
)
RETURNS TABLE (
  product_id uuid,
  group_key text,
  total_stock integer,
  purchase_value numeric,
  sale_value numeric,
  brand text,
  category text,
  department text,
  total_rows bigint
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_limit integer := GREATEST(COALESCE(p_limit, 100), 1);
  v_offset integer := GREATEST(COALESCE(p_offset, 0), 0);
  v_group_by text := lower(COALESCE(NULLIF(trim(p_group_by), ''), 'product_name'));
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_brand text := NULLIF(trim(COALESCE(p_brand, '')), '');
  v_category text := NULLIF(trim(COALESCE(p_category, '')), '');
  v_department text := NULLIF(trim(COALESCE(p_department, '')), '');
  v_supplier text := NULLIF(trim(COALESCE(p_supplier, '')), '');
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  WITH variant_supplier AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id AS variant_id,
      pb.supplier_name
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pi.id ASC
  ),
  base_variants AS (
    SELECT
      p.id AS product_id,
      pv.stock_qty,
      COALESCE(pv.pur_price, 0) AS pur_price,
      pv.sale_price,
      p.product_name,
      p.brand,
      p.category,
      p.style,
      COALESCE(vs.supplier_name, 'Unknown Supplier') AS supplier_name
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN variant_supplier vs ON vs.variant_id = pv.id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND pv.active = true
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND (v_brand IS NULL OR p.brand = v_brand)
      AND (v_category IS NULL OR p.category = v_category)
      AND (v_department IS NULL OR p.style = v_department)
      AND (v_supplier IS NULL OR vs.supplier_name = v_supplier)
      AND (
        v_search IS NULL
        OR v_group_by <> 'product_name'
        OR p.product_name ILIKE '%' || v_search || '%'
      )
  ),
  grouped AS (
    SELECT
      CASE
        WHEN v_group_by = 'product_name' THEN
          (array_agg(bv.product_id ORDER BY bv.product_id::text))[1]
        ELSE NULL::uuid
      END AS product_id,
      CASE v_group_by
        WHEN 'supplier' THEN bv.supplier_name
        WHEN 'brand' THEN COALESCE(bv.brand, 'No Brand')
        WHEN 'category' THEN COALESCE(bv.category, 'No Category')
        WHEN 'department' THEN COALESCE(bv.style, 'No Department')
        ELSE COALESCE(bv.product_name, 'Unknown')
      END AS group_key,
      COALESCE(SUM(bv.stock_qty), 0)::integer AS total_stock,
      COALESCE(SUM(bv.pur_price * bv.stock_qty), 0)::numeric AS purchase_value,
      COALESCE(SUM(bv.sale_price * bv.stock_qty), 0)::numeric AS sale_value,
      (array_agg(bv.brand ORDER BY bv.brand NULLS LAST))[1] AS brand,
      (array_agg(bv.category ORDER BY bv.category NULLS LAST))[1] AS category,
      (array_agg(bv.style ORDER BY bv.style NULLS LAST))[1] AS department
    FROM base_variants bv
    GROUP BY
      CASE v_group_by
        WHEN 'supplier' THEN bv.supplier_name
        WHEN 'brand' THEN COALESCE(bv.brand, 'No Brand')
        WHEN 'category' THEN COALESCE(bv.category, 'No Category')
        WHEN 'department' THEN COALESCE(bv.style, 'No Department')
        ELSE COALESCE(bv.product_name, 'Unknown')
      END
  ),
  filtered AS (
    SELECT
      g.*,
      COUNT(*) OVER ()::bigint AS total_rows
    FROM grouped g
    WHERE v_search IS NULL
       OR v_group_by = 'product_name'
       OR g.group_key ILIKE '%' || v_search || '%'
  )
  SELECT
    f.product_id,
    f.group_key,
    f.total_stock,
    f.purchase_value,
    f.sale_value,
    f.brand,
    f.category,
    f.department,
    f.total_rows
  FROM filtered f
  ORDER BY f.group_key
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

GRANT EXECUTE ON FUNCTION public.get_product_wise_stock_filter_options(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_wise_stock_report_totals(uuid, text, text, text, text, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_product_wise_stock_report(uuid, integer, integer, text, text, text, text, text, text) TO authenticated, service_role;
