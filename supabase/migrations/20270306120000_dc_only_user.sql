-- DC User login: sees only DC (No GST) transactions (2026-10-25).
-- Decided by the shop owner 25 Oct 2026 ("DC User sees only DC").
--
-- WHAT IT DOES
--   A DC User is an org member (role manager, so purchase screens open) whose User Rights carry
--   the special right "dc_only" (user_permissions.permissions -> special -> dc_only = true).
--   public.dc_only_user(org) is true for such a login. The dashboard, stock and Product
--   Dashboard functions below then return only DC figures for that login, whatever the app asks:
--     sales      only bills with a DC line; a mixed bill counts only its DC share
--                (sale_items.net_after_discount), quantity = DC lines only
--     purchases  only DC purchase bills (is_dc_purchase)
--     stock      only DC barcodes (product_variants.is_dc_product)
--     returns    only DC sale return lines and DC purchase returns
--     receivables  only what is due on bills with a DC line, DC share only
--   Every other login gets exactly the same results as before (dc_only_user is false).
--   'dcOnlyApplied' in the JSON tiles tells the app this build is live.
--
-- Bodies are the 24 Oct DC versions (20270228, 20270301, 20270302, 20270303, 20270304) plus the
-- DC-only lines. Signatures do not change (CREATE OR REPLACE keeps grants). Safe to run again.
-- Needs the 24 Oct DC SQL first (dc-hide-mode-all-2026-10-24.sql.txt).
--
-- UNDO: re-run 20270228120000, 20270301120000, 20270302120000, 20270303120000 and
--       20270304120000, then DROP FUNCTION public.dc_only_mode_ready(); and
--       DROP FUNCTION public.dc_only_user(uuid);

-- Reads only the caller's own User Rights row (RLS "Users can view their own permissions"
-- allows it), so it runs with the caller's rights, not as a definer function.
CREATE OR REPLACE FUNCTION public.dc_only_user(p_organization_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $$
  SELECT COALESCE((
    SELECT up.permissions -> 'special' ->> 'dc_only' = 'true'
    FROM public.user_permissions up
    WHERE up.organization_id = p_organization_id
      AND up.user_id = auth.uid()
    LIMIT 1
  ), false)
$$;

REVOKE ALL ON FUNCTION public.dc_only_user(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dc_only_user(uuid) TO authenticated, service_role;

COMMENT ON FUNCTION public.dc_only_user(uuid) IS
  'True when the calling login is a DC User of this org (User Rights special dc_only): reports then show only DC.';

-- get_stock_report
CREATE OR REPLACE FUNCTION public.get_stock_report(
  p_org_id uuid,
  p_limit integer DEFAULT 100,
  p_offset integer DEFAULT 0,
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
  p_supplier_invoice text DEFAULT NULL,
  p_hide_dc boolean DEFAULT false
)
RETURNS TABLE (
  variant_id uuid,
  product_name text,
  brand text,
  category text,
  style text,
  product_type text,
  uom text,
  size text,
  color text,
  barcode text,
  sale_price numeric,
  pur_price numeric,
  opening_qty integer,
  current_stock integer,
  purchase_qty numeric,
  sales_qty numeric,
  purchase_return_qty numeric,
  sale_return_qty numeric,
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
  v_search text := NULLIF(trim(COALESCE(p_search, '')), '');
  v_category text := public.normalize_product_brand_key(p_category);
  v_brand text := public.normalize_product_brand_key(p_brand);
  v_style text := public.normalize_product_brand_key(p_style);
  v_size text := NULLIF(trim(COALESCE(p_size, '')), '');
  v_color text := NULLIF(trim(COALESCE(p_color, '')), '');
  v_product_name text := NULLIF(trim(COALESCE(p_product_name, '')), '');
  v_supplier text := public.normalize_product_brand_key(p_supplier);
  v_supplier_invoice text := NULLIF(trim(COALESCE(p_supplier_invoice, '')), '');
  v_threshold integer := GREATEST(COALESCE(p_low_stock_threshold, 10), 0);
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
    WHERE (v_search IS NOT NULL OR v_supplier IS NOT NULL OR v_supplier_invoice IS NOT NULL)
      AND pb.organization_id = p_org_id
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
      pv.id AS variant_id,
      p.product_name,
      p.brand,
      p.category,
      p.style,
      p.product_type,
      COALESCE(p.uom, 'NOS') AS uom,
      pv.size,
      pv.color,
      pv.barcode,
      pv.sale_price,
      pv.pur_price,
      COALESCE(pv.opening_qty, 0)::integer AS opening_qty,
      COALESCE(pv.stock_qty, 0)::integer AS current_stock,
      COUNT(*) OVER ()::bigint AS total_rows
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    LEFT JOIN variant_purchase_source vps ON vps.variant_id = pv.id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND pv.active = true
      AND p.deleted_at IS NULL
      AND p.product_type IS DISTINCT FROM 'service'
      AND (p_hide_dc IS DISTINCT FROM true OR (SELECT public.dc_only_user(p_org_id)) OR COALESCE(pv.is_dc_product, false) = false)
      AND (NOT (SELECT public.dc_only_user(p_org_id)) OR pv.is_dc_product IS TRUE)
      AND (
        v_search IS NULL
        OR p.product_name ILIKE '%' || v_search || '%'
        OR pv.barcode ILIKE '%' || v_search || '%'
        OR p.brand ILIKE '%' || v_search || '%'
        OR p.category ILIKE '%' || v_search || '%'
        OR p.style ILIKE '%' || v_search || '%'
        OR COALESCE(vps.supplier_name, '') ILIKE '%' || v_search || '%'
      )
      AND (
        v_category IS NULL
        OR public.normalize_product_brand_key(p.category) = v_category
      )
      AND (
        v_brand IS NULL
        OR public.normalize_product_brand_key(p.brand) = v_brand
      )
      AND (
        v_style IS NULL
        OR public.normalize_product_brand_key(p.style) = v_style
      )
      AND (v_size IS NULL OR pv.size = v_size)
      AND (v_color IS NULL OR pv.color = v_color)
      AND (v_product_name IS NULL OR p.product_name = v_product_name)
      AND (
        v_supplier IS NULL
        OR public.normalize_product_brand_key(vps.supplier_name) = v_supplier
      )
      AND (
        v_supplier_invoice IS NULL
        OR lower(trim(COALESCE(vps.supplier_invoice_no, ''))) = lower(v_supplier_invoice)
      )
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
  ),
  page AS (
    SELECT b.*
    FROM base b
    ORDER BY b.current_stock DESC, b.product_name, b.size, b.variant_id
    LIMIT v_limit
    OFFSET v_offset
  ),
  purchased AS (
    SELECT
      pi.sku_id AS variant_id,
      COALESCE(SUM(pi.qty), 0)::numeric AS qty
    FROM public.purchase_items pi
    INNER JOIN page b ON b.variant_id = pi.sku_id
    WHERE pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  sold AS (
    SELECT
      si.variant_id,
      COALESCE(SUM(si.quantity), 0)::numeric AS qty
    FROM public.sale_items si
    INNER JOIN page b ON b.variant_id = si.variant_id
    WHERE si.deleted_at IS NULL
      AND si.variant_id IS NOT NULL
    GROUP BY si.variant_id
  ),
  purchase_returned AS (
    SELECT
      pri.sku_id AS variant_id,
      COALESCE(SUM(pri.qty), 0)::numeric AS qty
    FROM public.purchase_return_items pri
    INNER JOIN page b ON b.variant_id = pri.sku_id
    WHERE pri.deleted_at IS NULL
      AND pri.sku_id IS NOT NULL
    GROUP BY pri.sku_id
  ),
  sale_returned AS (
    SELECT
      sri.variant_id,
      COALESCE(SUM(sri.quantity), 0)::numeric AS qty
    FROM public.sale_return_items sri
    INNER JOIN page b ON b.variant_id = sri.variant_id
    WHERE sri.deleted_at IS NULL
      AND sri.variant_id IS NOT NULL
    GROUP BY sri.variant_id
  ),
  enriched AS (
    SELECT
      b.variant_id,
      b.product_name,
      b.brand,
      b.category,
      b.style,
      b.product_type,
      b.uom,
      b.size,
      b.color,
      b.barcode,
      b.sale_price,
      b.pur_price,
      b.opening_qty,
      b.current_stock,
      GREATEST(0, COALESCE(pu.qty, 0))::numeric AS purchase_qty,
      GREATEST(0, COALESCE(so.qty, 0))::numeric AS sales_qty,
      GREATEST(0, COALESCE(pr.qty, 0))::numeric AS purchase_return_qty,
      GREATEST(0, COALESCE(sr.qty, 0))::numeric AS sale_return_qty,
      b.total_rows
    FROM page b
    LEFT JOIN purchased pu ON pu.variant_id = b.variant_id
    LEFT JOIN sold so ON so.variant_id = b.variant_id
    LEFT JOIN purchase_returned pr ON pr.variant_id = b.variant_id
    LEFT JOIN sale_returned sr ON sr.variant_id = b.variant_id
  )
  SELECT
    e.variant_id,
    e.product_name,
    e.brand,
    e.category,
    e.style,
    e.product_type,
    e.uom,
    e.size,
    e.color,
    e.barcode,
    e.sale_price,
    e.pur_price,
    e.opening_qty,
    e.current_stock,
    e.purchase_qty,
    e.sales_qty,
    e.purchase_return_qty,
    e.sale_return_qty,
    e.total_rows
  FROM enriched e
  ORDER BY e.current_stock DESC, e.product_name, e.size, e.variant_id;
END;
$$;

-- get_stock_report_filtered_totals
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
  p_supplier_invoice text DEFAULT NULL,
  p_hide_dc boolean DEFAULT false
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
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

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
      AND (p_hide_dc IS DISTINCT FROM true OR (SELECT public.dc_only_user(p_org_id)) OR COALESCE(pv.is_dc_product, false) = false)
      AND (NOT (SELECT public.dc_only_user(p_org_id)) OR pv.is_dc_product IS TRUE)
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

-- get_stock_report_totals
CREATE OR REPLACE FUNCTION public.get_stock_report_totals(
  p_organization_id uuid,
  p_hide_dc boolean DEFAULT false
)
RETURNS json
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public'
AS $$
  SELECT public._assert_org_access(p_organization_id);
  SELECT json_build_object(
    'total_stock',   COALESCE(SUM(pv.stock_qty), 0)::int,
    'stock_value',   COALESCE(SUM(COALESCE(pv.pur_price, 0) * pv.stock_qty), 0),
    'sale_value',    COALESCE(SUM(pv.sale_price * pv.stock_qty), 0),
    'variant_count', COUNT(*)::int
  )
  FROM product_variants pv
  INNER JOIN products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_organization_id
    AND pv.active = true
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND p.product_type != 'service'
    AND (p_hide_dc IS DISTINCT FROM true OR (SELECT public.dc_only_user(p_organization_id))
         OR COALESCE(pv.is_dc_product, false) = false)
    AND (NOT (SELECT public.dc_only_user(p_organization_id)) OR pv.is_dc_product IS TRUE);
$$;

-- get_product_wise_stock_report_totals
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
      AND (p_hide_dc IS DISTINCT FROM true OR (SELECT public.dc_only_user(p_org_id)) OR COALESCE(pv.is_dc_product, false) = false)
      AND (NOT (SELECT public.dc_only_user(p_org_id)) OR pv.is_dc_product IS TRUE)
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

-- get_product_wise_stock_report
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
      AND (p_hide_dc IS DISTINCT FROM true OR (SELECT public.dc_only_user(p_org_id)) OR COALESCE(pv.is_dc_product, false) = false)
      AND (NOT (SELECT public.dc_only_user(p_org_id)) OR pv.is_dc_product IS TRUE)
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

-- get_product_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_product_dashboard_stats(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_product_type text DEFAULT NULL,
  p_size_group_id uuid DEFAULT NULL,
  p_stock_level text DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_hide_dc boolean DEFAULT false
)
RETURNS jsonb
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path TO public, pg_temp
AS $function$
  WITH filtered_products AS (
    SELECT p.id, p.product_type
    FROM public.products p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_product_type IS NULL OR p.product_type = p_product_type)
      AND (p_size_group_id IS NULL OR p.size_group_id = p_size_group_id)
      AND (
        p_hide_dc IS DISTINCT FROM true
        OR (SELECT public.dc_only_user(p_org_id))
        OR NOT EXISTS (
          SELECT 1 FROM public.product_variants dv
          WHERE dv.product_id = p.id AND dv.organization_id = p_org_id AND dv.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.product_variants dv
          WHERE dv.product_id = p.id AND dv.organization_id = p_org_id AND dv.deleted_at IS NULL
            AND COALESCE(dv.is_dc_product, false) = false
        )
      )
      AND (
        NOT (SELECT public.dc_only_user(p_org_id))
        OR EXISTS (
          SELECT 1 FROM public.product_variants dv
          WHERE dv.product_id = p.id AND dv.organization_id = p_org_id AND dv.deleted_at IS NULL
            AND dv.is_dc_product IS TRUE
        )
      )
      AND (
        p_search IS NULL
        OR p.product_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.brand, '') ILIKE '%' || p_search || '%'
        OR COALESCE(p.style, '') ILIKE '%' || p_search || '%'
        OR COALESCE(p.category, '') ILIKE '%' || p_search || '%'
        OR COALESCE(p.color, '') ILIKE '%' || p_search || '%'
        OR COALESCE(p.hsn_code, '') ILIKE '%' || p_search || '%'
        OR EXISTS (
          SELECT 1
          FROM public.product_variants pv
          WHERE pv.product_id = p.id
            AND pv.organization_id = p_org_id
            AND pv.deleted_at IS NULL
            AND COALESCE(pv.barcode, '') ILIKE '%' || p_search || '%'
        )
      )
  ),
  product_totals AS (
    SELECT
      fp.id AS product_id,
      fp.product_type,
      COALESCE(SUM(
        CASE WHEN fp.product_type = 'service' THEN 0
             ELSE COALESCE(pv.stock_qty, 0) END
      ), 0)::bigint AS total_stock,
      COUNT(pv.id)::bigint AS variant_count,
      COALESCE(SUM(
        CASE WHEN fp.product_type = 'service' THEN 0
             ELSE COALESCE(pv.stock_qty, 0) * COALESCE(pv.pur_price, 0) END
      ), 0)::numeric AS purchase_value,
      COALESCE(SUM(
        CASE WHEN fp.product_type = 'service' THEN 0
             ELSE COALESCE(pv.stock_qty, 0) * COALESCE(pv.sale_price, 0) END
      ), 0)::numeric AS sale_value,
      BOOL_OR(
        (p_min_price IS NULL OR COALESCE(pv.sale_price, 0) >= p_min_price)
        AND (p_max_price IS NULL OR COALESCE(pv.sale_price, 0) <= p_max_price)
      ) FILTER (WHERE pv.id IS NOT NULL) AS has_price_match
    FROM filtered_products fp
    LEFT JOIN public.product_variants pv
      ON pv.product_id = fp.id
     AND pv.organization_id = p_org_id
     AND pv.deleted_at IS NULL
     AND (p_hide_dc IS DISTINCT FROM true OR (SELECT public.dc_only_user(p_org_id)) OR COALESCE(pv.is_dc_product, false) = false)
     AND (NOT (SELECT public.dc_only_user(p_org_id)) OR pv.is_dc_product IS TRUE)
    GROUP BY fp.id, fp.product_type
  ),
  qualified_products AS (
    SELECT *
    FROM product_totals pt
    WHERE (
      p_stock_level IS NULL
      OR (p_stock_level = 'in_stock' AND (pt.total_stock > 0 OR pt.product_type = 'service'))
      OR (p_stock_level = 'low_stock' AND pt.product_type <> 'service' AND pt.total_stock BETWEEN 1 AND 10)
      OR (p_stock_level = 'out_of_stock' AND pt.product_type <> 'service' AND pt.total_stock = 0)
    )
    AND (
      (p_min_price IS NULL AND p_max_price IS NULL)
      OR COALESCE(pt.has_price_match, FALSE)
    )
  )
  SELECT jsonb_build_object(
    'total_products', COUNT(*)::bigint,
    'total_items', COALESCE(SUM(variant_count), 0)::bigint,
    'total_stock_qty', COALESCE(SUM(total_stock), 0)::bigint,
    'purchase_value', COALESCE(SUM(purchase_value), 0)::numeric,
    'sale_value', COALESCE(SUM(sale_value), 0)::numeric
  )
  FROM qualified_products;
$function$;

-- get_product_catalog_page
CREATE OR REPLACE FUNCTION public.get_product_catalog_page(
  p_org_id uuid,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50,
  p_search text DEFAULT NULL::text,
  p_category text DEFAULT NULL::text,
  p_product_type text DEFAULT NULL::text,
  p_size_group_id uuid DEFAULT NULL::uuid,
  p_stock_level text DEFAULT NULL::text,
  p_min_price numeric DEFAULT NULL::numeric,
  p_max_price numeric DEFAULT NULL::numeric,
  p_hide_dc boolean DEFAULT false
)
RETURNS TABLE(
  product_id uuid,
  product_name text,
  product_type text,
  category text,
  brand text,
  style text,
  color text,
  image_url text,
  hsn_code text,
  gst_per integer,
  default_pur_price numeric,
  default_sale_price numeric,
  status text,
  size_group_id uuid,
  total_stock bigint,
  variant_count bigint,
  user_cancelled_at timestamptz,
  total_count bigint
)
LANGUAGE sql
STABLE
SET search_path TO public, pg_temp
AS $function$
  with base as (
    select p.id,
           p.product_name,
           p.product_type,
           p.category,
           p.brand,
           p.style,
           p.color,
           p.image_url,
           p.hsn_code,
           p.gst_per,
           p.default_pur_price,
           p.default_sale_price,
           p.status,
           p.size_group_id,
           p.created_at,
           p.user_cancelled_at
    from public.products p
    where p.organization_id = p_org_id
      and p.deleted_at is null
      and (p_category is null or p.category = p_category)
      and (p_product_type is null or p.product_type = p_product_type)
      and (p_size_group_id is null or p.size_group_id = p_size_group_id)
      and (
        p_hide_dc is distinct from true
        or (select public.dc_only_user(p_org_id))
        or not exists (
          select 1 from public.product_variants dv
          where dv.product_id = p.id and dv.organization_id = p_org_id and dv.deleted_at is null
        )
        or exists (
          select 1 from public.product_variants dv
          where dv.product_id = p.id and dv.organization_id = p_org_id and dv.deleted_at is null
            and coalesce(dv.is_dc_product, false) = false
        )
      )
      and (
        not (select public.dc_only_user(p_org_id))
        or exists (
          select 1 from public.product_variants dv
          where dv.product_id = p.id and dv.organization_id = p_org_id and dv.deleted_at is null
            and dv.is_dc_product is true
        )
      )
      and (
        p_search is null
        or p.product_name ilike '%' || p_search || '%'
        or coalesce(p.brand, '') ilike '%' || p_search || '%'
        or exists (
          select 1
          from public.product_variants pv
          where pv.product_id = p.id
            and pv.organization_id = p_org_id
            and pv.deleted_at is null
            and coalesce(pv.barcode, '') ilike '%' || p_search || '%'
        )
      )
  ),
  fast_page as (
    select b.*
    from base b
    where p_stock_level is null
      and p_min_price is null
      and p_max_price is null
    order by b.created_at desc nulls last, b.id
    offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * greatest(coalesce(p_page_size, 50), 1), 0)
    limit greatest(coalesce(p_page_size, 50), 1)
  ),
  fast_total as (
    select count(*)::bigint as c
    from base
    where p_stock_level is null
      and p_min_price is null
      and p_max_price is null
  ),
  fast_with_variants as (
    select fp.*,
           coalesce(agg.total_stock, 0)::bigint as total_stock,
           coalesce(agg.variant_count, 0)::bigint as variant_count,
           (select c from fast_total) as total_count
    from fast_page fp
    left join lateral (
      select
        sum(coalesce(pv.stock_qty, 0))::bigint as total_stock,
        count(*)::bigint as variant_count
      from public.product_variants pv
      where pv.product_id = fp.id
        and pv.organization_id = p_org_id
        and pv.deleted_at is null
        and (p_hide_dc is distinct from true or (select public.dc_only_user(p_org_id)) or coalesce(pv.is_dc_product, false) = false)
        and (not (select public.dc_only_user(p_org_id)) or pv.is_dc_product is true)
    ) agg on true
  ),
  slow_totals as (
    select b.id as product_id,
           b.created_at,
           coalesce(sum(coalesce(pv.stock_qty, 0)), 0)::bigint as total_stock,
           count(pv.id)::bigint as variant_count,
           bool_or(
             (p_min_price is null or coalesce(pv.sale_price, 0) >= p_min_price)
             and (p_max_price is null or coalesce(pv.sale_price, 0) <= p_max_price)
           ) filter (where pv.id is not null) as has_price_match
    from base b
    left join public.product_variants pv
      on pv.product_id = b.id
     and pv.organization_id = p_org_id
     and pv.deleted_at is null
     and (p_hide_dc is distinct from true or (select public.dc_only_user(p_org_id)) or coalesce(pv.is_dc_product, false) = false)
     and (not (select public.dc_only_user(p_org_id)) or pv.is_dc_product is true)
    where p_stock_level is not null
       or p_min_price is not null
       or p_max_price is not null
    group by b.id, b.created_at
  ),
  slow_qualified as (
    select st.*
    from slow_totals st
    where (
      p_stock_level is null
      or (p_stock_level = 'in_stock' and st.total_stock > 0)
      or (p_stock_level = 'low_stock' and st.total_stock between 1 and 10)
      or (p_stock_level = 'out_of_stock' and st.total_stock = 0)
    )
    and (
      (p_min_price is null and p_max_price is null)
      or coalesce(st.has_price_match, false)
    )
  ),
  slow_page as (
    select b.id,
           b.product_name,
           b.product_type,
           b.category,
           b.brand,
           b.style,
           b.color,
           b.image_url,
           b.hsn_code,
           b.gst_per,
           b.default_pur_price,
           b.default_sale_price,
           b.status,
           b.size_group_id,
           b.user_cancelled_at,
           sq.total_stock,
           sq.variant_count,
           (select count(*)::bigint from slow_qualified) as total_count
    from slow_qualified sq
    join base b on b.id = sq.product_id
    order by b.created_at desc nulls last, b.id
    offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * greatest(coalesce(p_page_size, 50), 1), 0)
    limit greatest(coalesce(p_page_size, 50), 1)
  )
  select id,
         product_name,
         product_type,
         category,
         brand,
         style,
         color,
         image_url,
         hsn_code,
         gst_per,
         default_pur_price,
         default_sale_price,
         status,
         size_group_id,
         total_stock,
         variant_count,
         user_cancelled_at,
         total_count
  from fast_with_variants
  where p_stock_level is null
    and p_min_price is null
    and p_max_price is null
  union all
  select id,
         product_name,
         product_type,
         category,
         brand,
         style,
         color,
         image_url,
         hsn_code,
         gst_per,
         default_pur_price,
         default_sale_price,
         status,
         size_group_id,
         total_stock,
         variant_count,
         user_cancelled_at,
         total_count
  from slow_page
  where p_stock_level is not null
     or p_min_price is not null
     or p_max_price is not null;
$function$;

-- get_net_profit_kpis
CREATE OR REPLACE FUNCTION public.get_net_profit_kpis(
  p_org_id uuid,
  p_from_date date,
  p_to_date date,
  p_hide_dc boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  -- Same PostgREST bounds as loadProfitDataset:
  --   .gte(sale_date, fromDate) .lte(sale_date, toDate || 'T23:59:59')
  v_from timestamp := p_from_date::timestamp;
  v_to timestamp := (p_to_date::text || 'T23:59:59')::timestamp;
  v_result json;
  -- DC User login (User Rights "DC only"): only DC lines and bills with a DC line.
  v_only_dc boolean := public.dc_only_user(p_org_id);
  v_hide boolean := COALESCE(p_hide_dc, false) AND NOT v_only_dc;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  WITH period_sales AS (
    SELECT
      s.id,
      COALESCE(s.gross_amount, 0)::numeric AS gross_amount,
      GREATEST(COALESCE(s.discount_amount, 0), 0)::numeric AS header_item_disc,
      GREATEST(COALESCE(s.flat_discount_amount, 0), 0)::numeric AS header_flat,
      GREATEST(COALESCE(s.points_redeemed_amount, 0), 0)::numeric AS header_points
    FROM public.sales s
    WHERE s.organization_id = p_org_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND (s.payment_status IS NULL OR s.payment_status <> 'cancelled')
      AND (s.sale_type IS NULL OR s.sale_type <> 'sale_return')
      AND s.sale_date >= v_from
      AND s.sale_date <= v_to
      -- DC hidden: bills whose every line is DC are left out.
      AND NOT (v_hide AND COALESCE(s.is_dc_bill, false))
      -- DC only: bills with at least one DC line.
      AND (
        NOT v_only_dc
        OR EXISTS (
          SELECT 1 FROM public.sale_items di
          WHERE di.sale_id = s.id AND di.is_dc_item = true AND di.deleted_at IS NULL
        )
      )
  ),
  sale_lines AS (
    SELECT
      si.sale_id,
      si.variant_id,
      si.product_id,
      COALESCE(si.quantity, 0)::numeric AS quantity,
      COALESCE(si.line_total, 0)::numeric AS line_total,
      COALESCE(si.unit_price, 0)::numeric AS unit_price,
      COALESCE(si.mrp, 0)::numeric AS mrp,
      si.discount_share,
      si.round_off_share,
      si.net_after_discount,
      COALESCE(si.is_dc_item, false) AS is_dc
    FROM public.sale_items si
    JOIN period_sales ps ON ps.id = si.sale_id
    WHERE si.deleted_at IS NULL
      AND si.organization_id = p_org_id
      AND NOT (COALESCE(si.quantity, 0) = 0 AND COALESCE(si.line_total, 0) = 0)
  ),
  line_grossed AS (
    SELECT
      sl.*,
      CASE
        WHEN (sl.quantity * CASE WHEN sl.mrp > 0 THEN sl.mrp ELSE sl.unit_price END) > 0
          THEN sl.quantity * CASE WHEN sl.mrp > 0 THEN sl.mrp ELSE sl.unit_price END
        WHEN sl.line_total <> 0 THEN sl.line_total
        ELSE 0
      END AS line_gross
    FROM sale_lines sl
  ),
  line_alloc AS (
    SELECT
      lg.*,
      SUM(lg.line_gross) OVER (PARTITION BY lg.sale_id) AS mrp_allocation_base
    FROM line_grossed lg
  ),
  line_revenue AS (
    SELECT
      la.*,
      CASE
        WHEN SUM(la.line_gross) OVER (PARTITION BY la.sale_id) > 0
          THEN SUM(la.line_gross) OVER (PARTITION BY la.sale_id)
        ELSE ps.gross_amount
      END AS alloc_base,
      ps.header_item_disc,
      ps.header_flat,
      ps.header_points
    FROM line_alloc la
    JOIN period_sales ps ON ps.id = la.sale_id
  ),
  line_math AS (
    SELECT
      lr.*,
      CASE
        WHEN lr.alloc_base > 0 AND lr.line_gross > 0 THEN lr.line_gross / lr.alloc_base
        ELSE 0
      END AS mrp_weight,
      CASE
        WHEN lr.discount_share IS NOT NULL AND lr.discount_share >= 0 THEN lr.discount_share::numeric
        WHEN lr.header_flat > 0 AND lr.alloc_base > 0 AND GREATEST(lr.line_total, 0) / lr.alloc_base > 0
          THEN lr.header_flat * (GREATEST(lr.line_total, 0) / lr.alloc_base)
        ELSE 0
      END AS flat_share,
      CASE
        WHEN lr.alloc_base > 0 THEN GREATEST(lr.line_total, 0) / lr.alloc_base
        ELSE 0
      END AS points_weight,
      COALESCE(lr.round_off_share, 0)::numeric AS round_off_share_n
    FROM line_revenue lr
  ),
  line_priced AS (
    SELECT
      lm.*,
      CASE
        WHEN lm.header_item_disc > 0 AND lm.mrp_weight > 0 THEN lm.header_item_disc * lm.mrp_weight
        ELSE 0
      END AS line_discount,
      CASE
        WHEN lm.header_points > 0 AND lm.points_weight > 0 THEN lm.header_points * lm.points_weight
        ELSE 0
      END AS points_share
    FROM line_math lm
  ),
  line_netted AS (
    SELECT
      lp.*,
      (CASE
        WHEN lp.net_after_discount IS NOT NULL THEN lp.net_after_discount::numeric
        ELSE lp.line_total - lp.flat_share + lp.round_off_share_n
      END) - lp.points_share AS net_line
    FROM line_priced lp
  ),
  variant_avg AS (
    SELECT
      pi.sku_id,
      SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
        / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur
    FROM public.purchase_items pi
    WHERE pi.deleted_at IS NULL
      AND pi.sku_id IN (SELECT DISTINCT variant_id FROM sale_lines WHERE variant_id IS NOT NULL)
    GROUP BY pi.sku_id
  ),
  line_cogs AS (
    SELECT
      ln.is_dc,
      ln.net_line,
      ln.line_gross,
      ln.line_discount,
      ln.flat_share,
      ln.points_share,
      ln.round_off_share_n,
      CASE
        WHEN COALESCE(p.product_type, 'goods') = 'service' OR ln.variant_id IS NULL THEN 0
        ELSE ln.quantity * COALESCE(NULLIF(va.avg_pur, 0), pv.pur_price, 0)
      END AS cogs
    FROM line_netted ln
    LEFT JOIN public.product_variants pv
      ON pv.id = ln.variant_id
     AND pv.organization_id = p_org_id
    LEFT JOIN public.products p
      ON p.id = COALESCE(ln.product_id, pv.product_id)
     AND p.organization_id = p_org_id
    LEFT JOIN variant_avg va ON va.sku_id = ln.variant_id
  ),
  sale_totals AS (
    SELECT
      COALESCE(SUM(line_gross), 0) AS gross_sales,
      COALESCE(SUM(line_discount + flat_share + points_share), 0) AS discounts,
      COALESCE(SUM(round_off_share_n), 0) AS round_off,
      COALESCE(SUM(net_line), 0) AS net_sales,
      COALESCE(SUM(cogs), 0) AS total_cogs
    FROM line_cogs
    -- DC lines still count in each bill's discount base above, so other lines keep their share.
    WHERE NOT (v_hide AND is_dc)
      AND NOT (v_only_dc AND NOT is_dc)
  ),
  return_totals AS (
    SELECT COALESCE(SUM(ABS(sri.line_total)), 0) AS return_amount
    FROM public.sale_returns sr
    JOIN public.sale_return_items sri ON sri.return_id = sr.id
    WHERE sr.organization_id = p_org_id
      AND sr.deleted_at IS NULL
      AND sr.return_date >= v_from
      AND sr.return_date <= v_to
      AND NOT (COALESCE(sri.quantity, 0) = 0 AND COALESCE(sri.line_total, 0) = 0)
      AND NOT (v_hide AND COALESCE(sri.is_dc_item, false))
      AND NOT (v_only_dc AND NOT COALESCE(sri.is_dc_item, false))
  )
  SELECT json_build_object(
    'gross_sales', st.gross_sales,
    'discounts', st.discounts,
    'round_off', st.round_off,
    'net_sales', st.net_sales,
    'return_amount', rt.return_amount,
    'total_cogs', st.total_cogs,
    'gross_profit', st.net_sales - st.total_cogs,
    'margin_percent', CASE WHEN st.net_sales <> 0 THEN ((st.net_sales - st.total_cogs) / st.net_sales) * 100 ELSE 0 END,
    'invoice_count', (SELECT COUNT(*)::int FROM period_sales),
    'dcHideApplied', v_hide,
    'dcOnlyApplied', v_only_dc
  )
  INTO v_result
  FROM sale_totals st
  CROSS JOIN return_totals rt;

  RETURN v_result;
END;
$$;

-- get_erp_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_erp_dashboard_stats(
  p_org_id uuid,
  p_start_date date,
  p_end_date date,
  p_hide_dc boolean DEFAULT false
)
RETURNS json
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_result JSON;
  v_total_sales NUMERIC := 0;
  v_invoice_count INT := 0;
  v_sold_qty INT := 0;
  v_total_cash NUMERIC := 0;
  v_total_paid NUMERIC := 0;
  v_cash NUMERIC := 0;
  v_purchase_total NUMERIC := 0;
  v_purchase_count INT := 0;
  v_purchase_qty INT := 0;
  v_customer_count INT := 0;
  v_supplier_count INT := 0;
  v_product_count INT := 0;
  v_stock_qty INT := 0;
  v_stock_value NUMERIC := 0;
  v_receivables_total NUMERIC := 0;
  v_pending_count INT := 0;
  v_sr_total NUMERIC := 0;
  v_sr_count INT := 0;
  v_sr_qty INT := 0;
  v_pr_total NUMERIC := 0;
  v_pr_count INT := 0;
  v_pr_qty INT := 0;
  -- DC User login (User Rights "DC only"): only DC sales, purchases, stock and returns.
  v_only_dc boolean := public.dc_only_user(p_org_id);
  v_hide_dc boolean := COALESCE(p_hide_dc, false) AND NOT public.dc_only_user(p_org_id);
  v_from timestamptz := (p_start_date::timestamp AT TIME ZONE 'Asia/Kolkata');
  v_to timestamptz := ((p_end_date + 1)::timestamp AT TIME ZONE 'Asia/Kolkata');
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated'
     AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF v_hide_dc OR v_only_dc THEN
    -- Same bills as v_dashboard_sales_summary, minus all-DC bills; a mixed bill keeps
    -- only its non-DC share (sale_items.net_after_discount), qty without DC lines.
    WITH s0 AS (
      SELECT s.id, s.net_amount, s.paid_amount, s.cash_amount
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_cancelled, false) = false
        AND (v_only_dc OR COALESCE(s.is_dc_bill, false) = false)
        AND s.sale_date >= v_from
        AND s.sale_date < v_to
    ),
    l AS (
      SELECT
        si.sale_id,
        SUM(COALESCE(si.net_after_discount, si.line_total, 0)) AS all_net,
        SUM(CASE WHEN COALESCE(si.is_dc_item, false) THEN COALESCE(si.net_after_discount, si.line_total, 0) ELSE 0 END) AS dc_net,
        SUM(COALESCE(si.quantity, 0)) AS qty,
        SUM(CASE WHEN COALESCE(si.is_dc_item, false) THEN COALESCE(si.quantity, 0) ELSE 0 END) AS dc_qty,
        COUNT(*) FILTER (WHERE COALESCE(si.is_dc_item, false)) AS dc_lines
      FROM public.sale_items si
      JOIN s0 ON s0.id = si.sale_id
      WHERE si.deleted_at IS NULL
      GROUP BY si.sale_id
    ),
    k AS (
      SELECT
        s0.*,
        CASE
          -- DC only: a bill's DC share; bills without a DC line drop out.
          WHEN v_only_dc THEN
            CASE
              WHEN COALESCE(l.dc_lines, 0) = 0 THEN 0
              WHEN COALESCE(l.all_net, 0) <= 0 THEN 1
              ELSE GREATEST(0, LEAST(1, COALESCE(l.dc_net, 0) / l.all_net))
            END
          WHEN COALESCE(l.dc_net, 0) > 0 AND COALESCE(l.all_net, 0) > 0
            THEN GREATEST(0, LEAST(1, (l.all_net - l.dc_net) / l.all_net))
          ELSE 1
        END AS r,
        CASE
          WHEN v_only_dc THEN COALESCE(l.dc_qty, 0)
          ELSE COALESCE(l.qty, 0) - COALESCE(l.dc_qty, 0)
        END AS vis_qty
      FROM s0
      LEFT JOIN l ON l.sale_id = s0.id
    )
    SELECT
      COUNT(*) FILTER (WHERE k.r > 0)::int,
      COALESCE(SUM(COALESCE(k.net_amount, 0) * k.r), 0),
      COALESCE(SUM(k.vis_qty), 0)::int,
      COALESCE(SUM(COALESCE(k.cash_amount, 0) * k.r), 0),
      COALESCE(SUM(COALESCE(k.paid_amount, 0) * k.r), 0)
    INTO v_invoice_count, v_total_sales, v_sold_qty, v_total_cash, v_total_paid
    FROM k;
  ELSE
    SELECT
      COALESCE(SUM(invoice_count), 0)::int,
      COALESCE(SUM(total_sales), 0),
      COALESCE(SUM(sold_qty), 0)::int,
      COALESCE(SUM(total_cash), 0),
      COALESCE(SUM(total_paid), 0)
    INTO v_invoice_count, v_total_sales, v_sold_qty, v_total_cash, v_total_paid
    FROM v_dashboard_sales_summary
    WHERE organization_id = p_org_id
      AND sale_day >= p_start_date
      AND sale_day <= p_end_date;
  END IF;

  v_cash := COALESCE(NULLIF(v_total_cash, 0), v_total_paid);

  IF v_hide_dc OR v_only_dc THEN
    -- Same bills as v_dashboard_purchase_summary, minus DC purchase bills.
    SELECT
      COUNT(p.id)::int,
      COALESCE(SUM(p.net_amount), 0),
      COALESCE(SUM(q.purchase_qty), 0)::int
    INTO v_purchase_count, v_purchase_total, v_purchase_qty
    FROM public.purchase_bills p
    LEFT JOIN (
      SELECT pi.bill_id, SUM(pi.qty) AS purchase_qty
      FROM public.purchase_items pi
      JOIN public.purchase_bills pb ON pb.id = pi.bill_id
      WHERE pi.deleted_at IS NULL
        AND pb.organization_id = p_org_id
        AND pb.bill_date >= p_start_date
        AND pb.bill_date <= p_end_date
      GROUP BY pi.bill_id
    ) q ON q.bill_id = p.id
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND COALESCE(p.is_cancelled, false) = false
      AND COALESCE(p.is_dc_purchase, false) = v_only_dc
      AND p.bill_date >= p_start_date
      AND p.bill_date <= p_end_date;
  ELSE
    SELECT
      COALESCE(SUM(bill_count), 0)::int,
      COALESCE(SUM(total_purchase_amount), 0),
      COALESCE(SUM(total_items_purchased), 0)::int
    INTO v_purchase_count, v_purchase_total, v_purchase_qty
    FROM v_dashboard_purchase_summary
    WHERE organization_id = p_org_id
      AND purchase_day >= p_start_date
      AND purchase_day <= p_end_date;
  END IF;

  SELECT
    COALESCE(customer_count, 0)::int,
    COALESCE(supplier_count, 0)::int,
    COALESCE(product_count, 0)::int
  INTO v_customer_count, v_supplier_count, v_product_count
  FROM v_dashboard_counts
  WHERE organization_id = p_org_id;

  IF v_only_dc THEN
    -- DC only: products with a DC barcode.
    SELECT COUNT(DISTINCT pv.product_id)::int
    INTO v_product_count
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND pv.is_dc_product IS TRUE;
  END IF;

  IF v_hide_dc OR v_only_dc THEN
    -- Same variants as v_dashboard_stock_summary, minus DC barcodes.
    SELECT
      COALESCE(SUM(pv.stock_qty), 0)::int,
      COALESCE(SUM(pv.stock_qty * COALESCE(pv.pur_price, 0)), 0)
    INTO v_stock_qty, v_stock_value
    FROM public.product_variants pv
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_org_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND pv.active = true
      AND p.product_type <> 'service'
      AND COALESCE(pv.is_dc_product, false) = v_only_dc;
  ELSE
    SELECT
      COALESCE(total_stock_qty, 0)::int,
      COALESCE(total_stock_value, 0)
    INTO v_stock_qty, v_stock_value
    FROM v_dashboard_stock_summary
    WHERE organization_id = p_org_id;
  END IF;

  SELECT
    COALESCE(total_receivables, 0),
    COALESCE(pending_count, 0)::int
  INTO v_receivables_total, v_pending_count
  FROM v_dashboard_receivables
  WHERE organization_id = p_org_id;

  IF v_only_dc THEN
    -- DC only: what is still due on bills with a DC line, DC share only.
    WITH ps AS (
      SELECT s.id, GREATEST(COALESCE(s.net_amount, 0) - COALESCE(s.paid_amount, 0), 0) AS due
      FROM public.sales s
      WHERE s.organization_id = p_org_id
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_cancelled, false) = false
        AND s.payment_status = ANY (ARRAY['pending'::text, 'partial'::text])
        AND EXISTS (
          SELECT 1 FROM public.sale_items di
          WHERE di.sale_id = s.id AND di.is_dc_item = true AND di.deleted_at IS NULL
        )
    ),
    pl AS (
      SELECT
        si.sale_id,
        SUM(COALESCE(si.net_after_discount, si.line_total, 0)) AS all_net,
        SUM(CASE WHEN COALESCE(si.is_dc_item, false) THEN COALESCE(si.net_after_discount, si.line_total, 0) ELSE 0 END) AS dc_net
      FROM public.sale_items si
      JOIN ps ON ps.id = si.sale_id
      WHERE si.deleted_at IS NULL
      GROUP BY si.sale_id
    )
    SELECT
      COALESCE(SUM(ps.due * CASE
        WHEN COALESCE(pl.all_net, 0) <= 0 THEN 1
        ELSE GREATEST(0, LEAST(1, COALESCE(pl.dc_net, 0) / pl.all_net))
      END), 0),
      COUNT(*)::int
    INTO v_receivables_total, v_pending_count
    FROM ps
    LEFT JOIN pl ON pl.sale_id = ps.id;
  END IF;

  IF v_hide_dc OR v_only_dc THEN
    -- Returns of only DC lines left out; a mixed return keeps its non-DC share.
    WITH r0 AS (
      SELECT sr.id, sr.net_amount
      FROM sale_returns sr
      WHERE sr.organization_id = p_org_id
        AND sr.deleted_at IS NULL
        AND sr.return_date >= p_start_date
        AND sr.return_date <= p_end_date
    ),
    rl AS (
      SELECT
        sri.return_id,
        SUM(ABS(COALESCE(sri.line_total, 0))) AS all_t,
        SUM(CASE WHEN COALESCE(sri.is_dc_item, false) THEN ABS(COALESCE(sri.line_total, 0)) ELSE 0 END) AS dc_t,
        SUM(COALESCE(sri.quantity, 0)) AS qty,
        SUM(CASE WHEN COALESCE(sri.is_dc_item, false) THEN COALESCE(sri.quantity, 0) ELSE 0 END) AS dc_qty,
        bool_and(COALESCE(sri.is_dc_item, false)) AS all_dc
      FROM sale_return_items sri
      JOIN r0 ON r0.id = sri.return_id
      GROUP BY sri.return_id
    ),
    rk AS (
      SELECT
        r0.net_amount,
        CASE
          -- DC only: a return's DC share; returns without a DC line drop out.
          WHEN v_only_dc THEN
            CASE
              WHEN COALESCE(rl.all_dc, false) THEN 1
              WHEN COALESCE(rl.dc_t, 0) > 0 AND COALESCE(rl.all_t, 0) > 0
                THEN GREATEST(0, LEAST(1, rl.dc_t / rl.all_t))
              ELSE 0
            END
          WHEN COALESCE(rl.all_dc, false) THEN 0
          WHEN COALESCE(rl.dc_t, 0) > 0 AND COALESCE(rl.all_t, 0) > 0
            THEN GREATEST(0, LEAST(1, (rl.all_t - rl.dc_t) / rl.all_t))
          ELSE 1
        END AS r,
        CASE
          WHEN v_only_dc THEN COALESCE(rl.dc_qty, 0)
          ELSE COALESCE(rl.qty, 0) - COALESCE(rl.dc_qty, 0)
        END AS vis_qty
      FROM r0
      LEFT JOIN rl ON rl.return_id = r0.id
    )
    SELECT
      COALESCE(SUM(COALESCE(rk.net_amount, 0) * rk.r), 0),
      COUNT(*) FILTER (WHERE rk.r > 0)::int,
      COALESCE(SUM(rk.vis_qty), 0)::int
    INTO v_sr_total, v_sr_count, v_sr_qty
    FROM rk;
  ELSE
    SELECT
      COALESCE(SUM(net_amount), 0),
      COUNT(*)::int
    INTO v_sr_total, v_sr_count
    FROM sale_returns
    WHERE organization_id = p_org_id
      AND deleted_at IS NULL
      AND return_date >= p_start_date
      AND return_date <= p_end_date;

    IF v_sr_count > 0 THEN
      SELECT COALESCE(SUM(sri.quantity), 0)::int
      INTO v_sr_qty
      FROM sale_return_items sri
      INNER JOIN sale_returns sr ON sr.id = sri.return_id
      WHERE sr.organization_id = p_org_id
        AND sr.deleted_at IS NULL
        AND sr.return_date >= p_start_date
        AND sr.return_date <= p_end_date;
    END IF;
  END IF;

  SELECT
    COALESCE(SUM(net_amount), 0),
    COUNT(*)::int
  INTO v_pr_total, v_pr_count
  FROM purchase_returns
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND return_date >= p_start_date
    AND return_date <= p_end_date
    AND NOT (v_hide_dc AND COALESCE(is_dc, false))
    AND NOT (v_only_dc AND NOT COALESCE(is_dc, false));

  IF v_pr_count > 0 THEN
    SELECT COALESCE(SUM(pri.qty), 0)::int
    INTO v_pr_qty
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr ON pr.id = pri.return_id
    WHERE pr.organization_id = p_org_id
      AND pr.deleted_at IS NULL
      AND pr.return_date >= p_start_date
      AND pr.return_date <= p_end_date
      AND NOT (v_hide_dc AND COALESCE(pr.is_dc, false))
      AND NOT (v_only_dc AND NOT COALESCE(pr.is_dc, false));
  END IF;

  v_result := json_build_object(
    'total_sales', v_total_sales,
    'invoice_count', v_invoice_count,
    'sold_qty', v_sold_qty,
    'total_purchase', v_purchase_total,
    'purchase_count', v_purchase_count,
    'purchase_qty', v_purchase_qty,
    'customer_count', v_customer_count,
    'supplier_count', v_supplier_count,
    'product_count', v_product_count,
    'total_stock_qty', v_stock_qty,
    'total_stock_value', v_stock_value,
    'total_receivables', v_receivables_total,
    'pending_count', v_pending_count,
    'gross_profit', NULL,
    'cash_collection', v_cash,
    'sale_return_total', v_sr_total,
    'sale_return_count', v_sr_count,
    'sale_return_qty', v_sr_qty,
    'purchase_return_total', v_pr_total,
    'purchase_return_count', v_pr_count,
    'purchase_return_qty', v_pr_qty,
    'dcHideApplied', v_hide_dc,
    'dcOnlyApplied', v_only_dc
  );

  RETURN v_result;
END;
$$;

-- get_pos_dashboard_stats
CREATE OR REPLACE FUNCTION public.get_pos_dashboard_stats(
  p_organization_id uuid,
  p_date_from timestamptz DEFAULT NULL,
  p_date_to timestamptz DEFAULT NULL,
  p_filters jsonb DEFAULT '{}'::jsonb,
  p_search text DEFAULT NULL,
  p_customer_id uuid DEFAULT NULL
)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
SELECT COALESCE((
  WITH params AS (
    SELECT
      NULLIF(trim(p_search), '') AS v_search,
      COALESCE(NULLIF(trim(p_filters->>'cancelFilter'), ''), 'active') AS v_cancel,
      COALESCE(NULLIF(trim(p_filters->>'paymentMethodFilter'), ''), 'all') AS v_payment_method,
      COALESCE(NULLIF(trim(p_filters->>'saleTypeFilter'), ''), 'all') AS v_sale_type,
      COALESCE(NULLIF(trim(p_filters->>'refundFilter'), ''), 'all') AS v_refund,
      COALESCE(NULLIF(trim(p_filters->>'creditNoteFilter'), ''), 'all') AS v_credit_note,
      COALESCE(NULLIF(trim(p_filters->>'userFilter'), ''), 'all') AS v_user,
      CASE
        WHEN jsonb_typeof(p_filters->'salesmanFilter') = 'array' THEN p_filters->'salesmanFilter'
        ELSE '[]'::jsonb
      END AS v_salesmen,
      COALESCE(p_filters->'paymentStatusFilter', '[]'::jsonb) AS v_payment_status,
      (NULLIF(trim(p_search), '') IS NOT NULL) AS v_bypass_dates,
      (COALESCE(p_filters->>'hideDc', '') = 'true'
        AND NOT public.dc_only_user(p_organization_id)) AS v_hide_dc,
      -- DC User login (User Rights "DC only"): only bills with a DC line, DC share only.
      public.dc_only_user(p_organization_id) AS v_only_dc
  ),
  guard AS MATERIALIZED (
    SELECT public.assert_org_member(p_organization_id) AS checked
  ),
  filtered_raw AS (
    SELECT
      s.id,
      s.gross_amount,
      s.discount_amount,
      s.flat_discount_amount,
      s.points_redeemed_amount,
      s.net_amount,
      s.paid_amount,
      s.payment_status,
      s.payment_method,
      s.sale_number,
      s.cash_amount,
      s.card_amount,
      s.upi_amount,
      s.refund_amount,
      s.credit_note_id,
      s.credit_note_amount,
      s.sale_return_adjust,
      s.round_off,
      s.total_qty,
      s.is_cancelled
    FROM public.sales s
    CROSS JOIN params p
    CROSS JOIN guard g
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND (
        p.v_sale_type = 'dc' AND s.sale_type = 'delivery_challan'
        OR p.v_sale_type = 'pos' AND s.sale_type = 'pos'
        OR p.v_sale_type NOT IN ('dc', 'pos')
          AND s.sale_type IN ('pos', 'delivery_challan')
      )
      AND (
        NOT p.v_bypass_dates
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        OR p.v_bypass_dates
      )
      AND (p_customer_id IS NULL OR s.customer_id = p_customer_id)
      AND NOT (p.v_hide_dc AND COALESCE(s.is_dc_bill, false))
      AND (
        NOT p.v_only_dc
        OR EXISTS (
          SELECT 1 FROM public.sale_items di
          WHERE di.sale_id = s.id AND di.is_dc_item = true AND di.deleted_at IS NULL
        )
      )
      AND (
        p.v_search IS NULL
        OR s.sale_number ILIKE '%' || p.v_search || '%'
        OR s.customer_name ILIKE '%' || p.v_search || '%'
        OR s.customer_phone ILIKE '%' || p.v_search || '%'
        OR (
          p.v_search ~ '^\d{1,6}$'
          AND s.sale_number ILIKE '%/' || p.v_search
        )
      )
      AND (
        p.v_cancel = 'all'
        OR (p.v_cancel = 'cancelled' AND s.is_cancelled = true)
        OR (p.v_cancel = 'active' AND (s.is_cancelled IS NULL OR s.is_cancelled = false))
      )
      AND (p.v_user = 'all' OR p.v_user = '__pending__' OR s.created_by::text = p.v_user)
      AND (
        NOT (jsonb_typeof(p.v_salesmen) = 'array' AND jsonb_array_length(p.v_salesmen) > 0)
        OR s.salesman = ANY (SELECT jsonb_array_elements_text(p.v_salesmen))
      )
      AND (p.v_payment_method = 'all' OR s.payment_method = p.v_payment_method)
      AND (
        NOT (jsonb_typeof(p.v_payment_status) = 'array' AND jsonb_array_length(p.v_payment_status) > 0)
        OR s.payment_status = ANY (SELECT jsonb_array_elements_text(p.v_payment_status))
      )
      AND (
        p.v_sale_type <> 'cn'
        OR s.credit_note_id IS NOT NULL
        OR COALESCE(s.credit_note_amount, 0) > 0
      )
      AND (
        p.v_refund = 'all'
        OR (p.v_refund = 'with_refund' AND COALESCE(s.refund_amount, 0) > 0)
        OR (p.v_refund = 'without_refund' AND (s.refund_amount IS NULL OR s.refund_amount = 0))
      )
      AND (
        p.v_credit_note = 'all'
        OR (p.v_credit_note = 'with_credit_note' AND (s.credit_note_id IS NOT NULL OR COALESCE(s.credit_note_amount, 0) > 0))
        OR (
          p.v_credit_note = 'without_credit_note'
          AND s.credit_note_id IS NULL
          AND (s.credit_note_amount IS NULL OR s.credit_note_amount = 0)
        )
      )
  ),
  -- DC hidden: a mixed bill counts only its non-DC share (DC lines' share of the line totals
  -- after bill discount / round-off), and its DC quantity is taken off.
  filtered_sales AS (
    SELECT
      fr.id,
      fr.gross_amount * k.r AS gross_amount,
      fr.discount_amount * k.r AS discount_amount,
      fr.flat_discount_amount * k.r AS flat_discount_amount,
      fr.points_redeemed_amount * k.r AS points_redeemed_amount,
      fr.net_amount * k.r AS net_amount,
      fr.paid_amount * k.r AS paid_amount,
      fr.payment_status,
      fr.payment_method,
      fr.sale_number,
      fr.cash_amount * k.r AS cash_amount,
      fr.card_amount * k.r AS card_amount,
      fr.upi_amount * k.r AS upi_amount,
      fr.refund_amount * k.r AS refund_amount,
      fr.credit_note_id,
      fr.credit_note_amount * k.r AS credit_note_amount,
      fr.sale_return_adjust * k.r AS sale_return_adjust,
      fr.round_off * k.r AS round_off,
      CASE
        WHEN p.v_only_dc THEN k.dc_qty
        ELSE GREATEST(0, COALESCE(fr.total_qty, 0) - k.dc_qty)
      END AS total_qty,
      fr.is_cancelled
    FROM filtered_raw fr
    CROSS JOIN params p
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(si.net_after_discount, si.line_total, 0)) AS dc_net,
        SUM(COALESCE(si.quantity, 0)) AS dc_qty
      FROM public.sale_items si
      WHERE (p.v_hide_dc OR p.v_only_dc)
        AND si.sale_id = fr.id
        AND si.is_dc_item = true
        AND si.deleted_at IS NULL
    ) d ON true
    LEFT JOIN LATERAL (
      SELECT SUM(COALESCE(si.net_after_discount, si.line_total, 0)) AS all_net
      FROM public.sale_items si
      WHERE (COALESCE(d.dc_net, 0) > 0 OR p.v_only_dc)
        AND si.sale_id = fr.id
        AND si.deleted_at IS NULL
    ) t ON true
    CROSS JOIN LATERAL (
      SELECT
        CASE
          WHEN p.v_only_dc THEN
            CASE
              WHEN COALESCE(t.all_net, 0) <= 0 THEN 1::numeric
              ELSE GREATEST(0::numeric, LEAST(1::numeric, COALESCE(d.dc_net, 0) / t.all_net))
            END
          WHEN COALESCE(d.dc_net, 0) <= 0 OR COALESCE(t.all_net, 0) <= 0 THEN 1::numeric
          ELSE GREATEST(0::numeric, LEAST(1::numeric, (t.all_net - d.dc_net) / t.all_net))
        END AS r,
        COALESCE(d.dc_qty, 0) AS dc_qty
    ) k
  ),
  sale_metrics AS (
    SELECT
      fs.*,
      (
        fs.payment_status = 'hold'
        OR (
          fs.payment_status = 'pending'
          AND fs.sale_number LIKE 'Hold/%'
          AND fs.payment_method = 'pay_later'
        )
      ) AS is_hold,
      GREATEST(0, COALESCE(fs.net_amount, 0))::numeric AS net_amt,
      ROUND(
        (COALESCE(fs.cash_amount, 0) + COALESCE(fs.card_amount, 0) + COALESCE(fs.upi_amount, 0))::numeric,
        2
      ) AS tender_amt
    FROM filtered_sales fs
  ),
  computed AS (
    SELECT
      sm.*,
      CASE
        WHEN sm.is_hold THEN COALESCE(sm.paid_amount, 0)
        WHEN sm.tender_amt <= 0.01 THEN LEAST(sm.net_amt, GREATEST(0, COALESCE(sm.paid_amount, 0)))
        ELSE LEAST(sm.net_amt, GREATEST(COALESCE(sm.paid_amount, 0), sm.tender_amt))
      END AS effective_paid
    FROM sale_metrics sm
  ),
  classified AS (
    SELECT
      c.*,
      (
        NOT c.is_hold
        AND c.effective_paid + COALESCE(c.sale_return_adjust, 0) >= c.net_amt - 0.01
      ) AS is_completed,
      GREATEST(
        0,
        c.net_amt - c.effective_paid - COALESCE(c.sale_return_adjust, 0)
      ) AS outstanding
    FROM computed c
  )
  SELECT json_build_object(
    'totalBills', COUNT(*)::integer,
    'totalQty', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(total_qty, 0) ELSE 0 END), 0)::integer,
    'totalAmount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN
        CASE
          WHEN COALESCE(gross_amount, 0) > 0 THEN COALESCE(gross_amount, 0)
          ELSE COALESCE(net_amt, 0)
        END
      ELSE 0 END
    ), 0),
    'totalDiscount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN
        COALESCE(discount_amount, 0) + COALESCE(flat_discount_amount, 0) + COALESCE(points_redeemed_amount, 0)
      ELSE 0 END
    ), 0),
    'netSale', COALESCE(SUM(CASE WHEN NOT is_hold THEN net_amt ELSE 0 END), 0),
    'completedCount', COUNT(*) FILTER (WHERE NOT is_hold AND is_completed)::integer,
    'completedAmount', COALESCE(SUM(CASE WHEN NOT is_hold AND is_completed THEN net_amt ELSE 0 END), 0),
    'pendingCount', COUNT(*) FILTER (WHERE NOT is_hold AND NOT is_completed)::integer,
    'pendingAmount', COALESCE(SUM(CASE WHEN NOT is_hold AND NOT is_completed THEN outstanding ELSE 0 END), 0),
    'holdCount', COUNT(*) FILTER (WHERE is_hold)::integer,
    'holdAmount', COALESCE(SUM(CASE WHEN is_hold THEN net_amt ELSE 0 END), 0),
    'refundCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(refund_amount, 0) > 0)::integer,
    'refundAmount', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(refund_amount, 0) ELSE 0 END), 0),
    'creditNoteCount', COUNT(*) FILTER (
      WHERE NOT is_hold AND (credit_note_id IS NOT NULL OR COALESCE(credit_note_amount, 0) > 0)
    )::integer,
    'creditNoteAmount', COALESCE(SUM(
      CASE WHEN NOT is_hold THEN COALESCE(credit_note_amount, 0) ELSE 0 END
    ), 0),
    'totalCash', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(cash_amount, 0) ELSE 0 END), 0),
    'totalCard', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(card_amount, 0) ELSE 0 END), 0),
    'totalUpi', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(upi_amount, 0) ELSE 0 END), 0),
    'totalBalance', COALESCE(SUM(CASE WHEN NOT is_hold THEN outstanding ELSE 0 END), 0),
    'totalSaleReturnAdjust', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(sale_return_adjust, 0) ELSE 0 END), 0),
    'totalRoundOff', COALESCE(SUM(CASE WHEN NOT is_hold THEN COALESCE(round_off, 0) ELSE 0 END), 0),
    'cashBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(cash_amount, 0) > 0)::integer,
    'cardBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(card_amount, 0) > 0)::integer,
    'upiBillCount', COUNT(*) FILTER (WHERE NOT is_hold AND COALESCE(upi_amount, 0) > 0)::integer,
    'salesmanFilterApplied', true,
    'dcHideApplied', true,
    'dcOnlyApplied', (SELECT v_only_dc FROM params)
  )
  FROM classified
), json_build_object(
  'totalBills', 0,
  'totalQty', 0,
  'totalAmount', 0,
  'totalDiscount', 0,
  'netSale', 0,
  'completedCount', 0,
  'completedAmount', 0,
  'pendingCount', 0,
  'pendingAmount', 0,
  'holdCount', 0,
  'holdAmount', 0,
  'refundCount', 0,
  'refundAmount', 0,
  'creditNoteCount', 0,
  'creditNoteAmount', 0,
  'totalCash', 0,
  'totalCard', 0,
  'totalUpi', 0,
  'totalBalance', 0,
  'totalSaleReturnAdjust', 0,
  'totalRoundOff', 0,
  'cashBillCount', 0,
  'cardBillCount', 0,
  'upiBillCount', 0,
  'salesmanFilterApplied', true,
  'dcHideApplied', true
))
$fn$
;

-- Marker the app checks before it offers "DC User" in Create New User.
CREATE OR REPLACE FUNCTION public.dc_only_mode_ready()
RETURNS boolean
LANGUAGE sql
IMMUTABLE
AS $$ SELECT true $$;

REVOKE ALL ON FUNCTION public.dc_only_mode_ready() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.dc_only_mode_ready() TO authenticated, service_role;

NOTIFY pgrst, 'reload schema';
