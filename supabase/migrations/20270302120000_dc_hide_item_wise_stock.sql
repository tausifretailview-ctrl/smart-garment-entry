-- DC (No GST) stock hidden on Item-wise Stock (desktop panel and phone report) when the
-- screen hides DC (Settings > Purchase "Hide DC", or Ctrl+Shift+H). 2026-10-24.
--
-- WHAT IT DOES
--   get_product_wise_stock_report and get_product_wise_stock_report_totals get one new last
--   argument, p_hide_dc boolean DEFAULT false. When true, barcodes tagged as DC products
--   (product_variants.is_dc_product) are left out of the groups and the totals.
--   With p_hide_dc false (every existing caller) the results are exactly as before.
--
-- Bodies are the repo versions (20261004120000_stock_report_qty_parity.sql) plus that filter
-- and the anon rejection from 20260828190100_fix_fail_open_org_guards.sql. Old signatures are
-- dropped so PostgREST never sees two candidates.
--
-- UNDO: DROP the two new signatures below, then re-run 20261004120000_stock_report_qty_parity.sql
--       (its first two functions) and the grants in 20260818030347_….sql.

DROP FUNCTION IF EXISTS public.get_product_wise_stock_report_totals(uuid, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_product_wise_stock_report_totals(
  p_org_id uuid,
  p_group_by text DEFAULT 'product_name',
  p_search text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_supplier text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_closing_stock text DEFAULT NULL,
  p_hide_dc boolean DEFAULT false
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
  v_barcode text := NULLIF(trim(COALESCE(p_barcode, '')), '');
  v_closing_stock text := lower(COALESCE(NULLIF(trim(p_closing_stock), ''), 'all'));
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

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
    ORDER BY
      pi.sku_id,
      COALESCE(pb.bill_date, pb.created_at::date, pi.created_at::date) DESC NULLS LAST,
      COALESCE(pb.created_at, pi.created_at) DESC NULLS LAST,
      pi.created_at DESC,
      pi.id DESC
  ),
  base_variants AS (
    SELECT
      pv.stock_qty,
      COALESCE(pv.pur_price, 0) AS pur_price,
      pv.sale_price,
      pv.barcode,
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
      AND (p_hide_dc IS DISTINCT FROM true OR COALESCE(pv.is_dc_product, false) = false)
      AND (v_brand IS NULL OR p.brand = v_brand)
      AND (v_category IS NULL OR p.category = v_category)
      AND (v_department IS NULL OR p.style = v_department)
      AND (v_supplier IS NULL OR vs.supplier_name = v_supplier)
      AND (v_barcode IS NULL OR pv.barcode ILIKE '%' || v_barcode || '%')
      AND (
        v_closing_stock IN ('all', '')
        OR (v_closing_stock = 'in_stock' AND COALESCE(pv.stock_qty, 0) > 0)
        OR (v_closing_stock = 'zero_stock' AND COALESCE(pv.stock_qty, 0) <= 0)
      )
      AND (
        v_search IS NULL
        OR v_group_by <> 'product_name'
        OR p.product_name ILIKE '%' || v_search || '%'
      )
      AND (
        v_search IS NULL
        OR v_group_by <> 'barcode'
        OR pv.barcode ILIKE '%' || v_search || '%'
      )
  ),
  grouped AS (
    SELECT
      CASE v_group_by
        WHEN 'supplier' THEN bv.supplier_name
        WHEN 'brand' THEN COALESCE(bv.brand, 'No Brand')
        WHEN 'category' THEN COALESCE(bv.category, 'No Category')
        WHEN 'department' THEN COALESCE(bv.style, 'No Department')
        WHEN 'barcode' THEN COALESCE(NULLIF(trim(bv.barcode), ''), '(No Barcode)')
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
     OR v_group_by IN ('product_name', 'barcode')
     OR g.group_key ILIKE '%' || v_search || '%';
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_wise_stock_report_totals(uuid, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_wise_stock_report_totals(uuid, text, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_product_wise_stock_report(uuid, integer, integer, text, text, text, text, text, text, text, text);

CREATE OR REPLACE FUNCTION public.get_product_wise_stock_report(
  p_org_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
  p_group_by text DEFAULT 'product_name',
  p_search text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_supplier text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_closing_stock text DEFAULT NULL,
  p_hide_dc boolean DEFAULT false
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
  v_barcode text := NULLIF(trim(COALESCE(p_barcode, '')), '');
  v_closing_stock text := lower(COALESCE(NULLIF(trim(p_closing_stock), ''), 'all'));
BEGIN
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

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
    ORDER BY
      pi.sku_id,
      COALESCE(pb.bill_date, pb.created_at::date, pi.created_at::date) DESC NULLS LAST,
      COALESCE(pb.created_at, pi.created_at) DESC NULLS LAST,
      pi.created_at DESC,
      pi.id DESC
  ),
  base_variants AS (
    SELECT
      p.id AS product_id,
      pv.stock_qty,
      COALESCE(pv.pur_price, 0) AS pur_price,
      pv.sale_price,
      pv.barcode,
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
      AND (p_hide_dc IS DISTINCT FROM true OR COALESCE(pv.is_dc_product, false) = false)
      AND (v_brand IS NULL OR p.brand = v_brand)
      AND (v_category IS NULL OR p.category = v_category)
      AND (v_department IS NULL OR p.style = v_department)
      AND (v_supplier IS NULL OR vs.supplier_name = v_supplier)
      AND (v_barcode IS NULL OR pv.barcode ILIKE '%' || v_barcode || '%')
      AND (
        v_closing_stock IN ('all', '')
        OR (v_closing_stock = 'in_stock' AND COALESCE(pv.stock_qty, 0) > 0)
        OR (v_closing_stock = 'zero_stock' AND COALESCE(pv.stock_qty, 0) <= 0)
      )
      AND (
        v_search IS NULL
        OR v_group_by <> 'product_name'
        OR p.product_name ILIKE '%' || v_search || '%'
      )
      AND (
        v_search IS NULL
        OR v_group_by <> 'barcode'
        OR pv.barcode ILIKE '%' || v_search || '%'
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
        WHEN 'barcode' THEN COALESCE(NULLIF(trim(bv.barcode), ''), '(No Barcode)')
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
        WHEN 'barcode' THEN COALESCE(NULLIF(trim(bv.barcode), ''), '(No Barcode)')
        ELSE COALESCE(bv.product_name, 'Unknown')
      END
  ),
  filtered AS (
    SELECT
      g.*,
      COUNT(*) OVER ()::bigint AS total_rows
    FROM grouped g
    WHERE v_search IS NULL
       OR v_group_by IN ('product_name', 'barcode')
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
  ORDER BY f.total_stock DESC, f.group_key
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_product_wise_stock_report(uuid, integer, integer, text, text, text, text, text, text, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_product_wise_stock_report(uuid, integer, integer, text, text, text, text, text, text, text, text, boolean) TO authenticated, service_role;

COMMENT ON FUNCTION public.get_product_wise_stock_report(uuid, integer, integer, text, text, text, text, text, text, text, text, boolean) IS
  'Paginated Item-wise Stock Report; supplier from latest purchase bill; p_hide_dc leaves DC barcodes out.';

NOTIFY pgrst, 'reload schema';
