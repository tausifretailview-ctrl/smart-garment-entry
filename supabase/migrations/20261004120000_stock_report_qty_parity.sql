-- Stock qty parity: align Item-wise supplier attribution with Stock Report (latest purchase bill),
-- and add filtered totals RPC so Stock Report KPI cards match full filtered SUM(stock_qty).

-- ---------------------------------------------------------------------------
-- Item-wise: latest purchase bill per variant (parity with get_stock_report)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_product_wise_stock_report_totals(
  p_org_id uuid,
  p_group_by text DEFAULT 'product_name',
  p_search text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_department text DEFAULT NULL,
  p_supplier text DEFAULT NULL,
  p_barcode text DEFAULT NULL,
  p_closing_stock text DEFAULT NULL
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
  p_closing_stock text DEFAULT NULL
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

COMMENT ON FUNCTION public.get_product_wise_stock_report(uuid, integer, integer, text, text, text, text, text, text, text, text) IS
  'Paginated Item-wise Stock Report — supplier from latest purchase bill (parity with Stock Report).';

-- ---------------------------------------------------------------------------
-- Stock Report: filtered SUM(stock_qty) for KPI cards (same filters as get_stock_report)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_stock_report_filtered_totals(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_brand text DEFAULT NULL,
  p_low_stock boolean DEFAULT NULL,
  p_style text DEFAULT NULL,
  p_size text DEFAULT NULL,
  p_color text DEFAULT NULL,
  p_product_name text DEFAULT NULL,
  p_in_stock boolean DEFAULT NULL,
  p_low_stock_band boolean DEFAULT NULL,
  p_low_stock_threshold integer DEFAULT 10,
  p_supplier text DEFAULT NULL,
  p_supplier_invoice text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_category text := NULLIF(trim(COALESCE(p_category, '')), '');
  v_brand text := NULLIF(trim(COALESCE(p_brand, '')), '');
  v_style text := NULLIF(trim(COALESCE(p_style, '')), '');
  v_size text := NULLIF(trim(COALESCE(p_size, '')), '');
  v_color text := NULLIF(trim(COALESCE(p_color, '')), '');
  v_product_name text := NULLIF(trim(COALESCE(p_product_name, '')), '');
  v_supplier text := NULLIF(trim(COALESCE(p_supplier, '')), '');
  v_supplier_invoice text := NULLIF(trim(COALESCE(p_supplier_invoice, '')), '');
  v_threshold integer := GREATEST(COALESCE(p_low_stock_threshold, 10), 0);
  v_result json;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  WITH variant_purchase_source AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id AS variant_id,
      pb.supplier_name,
      COALESCE(
        NULLIF(trim(pb.supplier_invoice_no), ''),
        NULLIF(trim(pb.software_bill_no), '')
      ) AS supplier_invoice_no
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
  base AS (
    SELECT
      COALESCE(pv.stock_qty, 0)::integer AS current_stock,
      COALESCE(pv.pur_price, 0) AS pur_price,
      pv.sale_price
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN variant_purchase_source vps ON vps.variant_id = pv.id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND pv.active = true
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND (
        v_search IS NULL
        OR p.product_name ILIKE '%' || v_search || '%'
        OR pv.barcode ILIKE '%' || v_search || '%'
        OR p.brand ILIKE '%' || v_search || '%'
        OR p.category ILIKE '%' || v_search || '%'
        OR p.style ILIKE '%' || v_search || '%'
      )
      AND (v_category IS NULL OR p.category = v_category)
      AND (v_brand IS NULL OR p.brand = v_brand)
      AND (v_style IS NULL OR p.style = v_style)
      AND (v_size IS NULL OR pv.size = v_size)
      AND (v_color IS NULL OR pv.color = v_color)
      AND (v_product_name IS NULL OR p.product_name = v_product_name)
      AND (v_supplier IS NULL OR vps.supplier_name = v_supplier)
      AND (v_supplier_invoice IS NULL OR vps.supplier_invoice_no = v_supplier_invoice)
      AND (p_low_stock IS DISTINCT FROM true OR COALESCE(pv.stock_qty, 0) <= 0)
      AND (
        p_in_stock IS DISTINCT FROM true
        OR COALESCE(pv.stock_qty, 0) > v_threshold
      )
      AND (
        p_low_stock_band IS DISTINCT FROM true
        OR (
          COALESCE(pv.stock_qty, 0) > 0
          AND COALESCE(pv.stock_qty, 0) <= v_threshold
        )
      )
  )
  SELECT json_build_object(
    'total_stock', COALESCE(SUM(b.current_stock), 0)::bigint,
    'stock_value', COALESCE(SUM(b.pur_price * b.current_stock), 0)::numeric,
    'sale_value', COALESCE(SUM(b.sale_price * b.current_stock), 0)::numeric,
    'variant_count', COUNT(*)::bigint
  )
  INTO v_result
  FROM base b;

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_stock_report_filtered_totals(
  uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text
) IS
  'Filtered Stock Report totals — SUM(product_variants.stock_qty) with same filters as get_stock_report.';

GRANT EXECUTE ON FUNCTION public.get_stock_report_filtered_totals(
  uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text
) TO authenticated, service_role;
