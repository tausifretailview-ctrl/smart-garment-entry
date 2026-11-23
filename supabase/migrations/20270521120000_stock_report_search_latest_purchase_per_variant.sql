-- Stock Report: faster search and supplier / invoice filters (speed review item D11).
--
-- Before: whenever the Stock Report had a search, a supplier or an invoice filter,
-- get_stock_report first found the latest purchase bill of EVERY variant of the shop
-- (DISTINCT ON over all purchase lines, sorted), only to read the supplier name and
-- invoice no of a few. get_stock_report_filtered_totals did the same for the supplier
-- and invoice filters. In large shops this took most of the report's time.
--
-- Now: the bills that pass the filter are found first (purchase_bills is small). Only the
-- variants bought on one of those bills can have a latest bill that passes it, and only
-- they look up their latest bill (one index read each, same order as before). Variants
-- already matched by name, barcode, brand, category or style look up nothing.
--
-- Same rules, signature, output columns, row order and shop check as 20270306120000.
-- `SET jit = off`: the per-variant lookup has a high cost estimate, and JIT compiling
-- the query took longer (about 1 s) than running it.
--
-- Checked on a local Postgres against the previous bodies: identical output over 7 random
-- data sets x 1,728 filter combinations (search incl. '%', '_' and supplier-only matches;
-- supplier and invoice spelling variants; low-stock, in-stock and DC switches).
-- 60,000 variants / 400,000 purchase lines: product search 650 -> 120 ms, supplier filter
-- 600 -> 70 ms, invoice filter 450 -> 13 ms.
--
-- Safe to run twice. To undo, run the two functions from 20270306120000_dc_only_user.sql.

DO $check$
DECLARE
  v_src text;
BEGIN
  SELECT p.prosrc INTO v_src FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.get_stock_report(uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean)');
  IF v_src IS NULL OR position('dc_only_user(p_org_id)' IN v_src) = 0
     OR (position('variant_purchase_source' IN v_src) = 0 AND position('supplier_hint' IN v_src) = 0) THEN
    RAISE EXCEPTION 'get_stock_report on this database is not the 20270306120000 version; nothing was changed';
  END IF;
  SELECT p.prosrc INTO v_src FROM pg_proc p
  WHERE p.oid = to_regprocedure('public.get_stock_report_filtered_totals(uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean)');
  IF v_src IS NULL OR position('dc_only_user(p_org_id)' IN v_src) = 0
     OR (position('variant_purchase_source' IN v_src) = 0 AND position('supplier_hint' IN v_src) = 0) THEN
    RAISE EXCEPTION 'get_stock_report_filtered_totals on this database is not the 20270306120000 version; nothing was changed';
  END IF;
END
$check$;

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
SET jit = off
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
  -- A search of only '%' signs matches every text, an empty supplier name included.
  v_search_matches_all boolean := v_search IS NOT NULL AND '' ILIKE '%' || v_search || '%';
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
  WITH search_hint AS (
    -- Variants bought at least once on a bill that passes the filter. Only these can have a
    -- latest purchase bill that passes it, so only these look up their latest bill.
    SELECT DISTINCT pi.sku_id AS variant_id
    FROM public.purchase_bills pb
    INNER JOIN public.purchase_items pi ON pi.bill_id = pb.id
    WHERE v_search IS NOT NULL
      AND pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND pb.supplier_name ILIKE '%' || v_search || '%'
  ),
  supplier_hint AS (
    -- Variants bought at least once on a bill that passes the filter. Only these can have a
    -- latest purchase bill that passes it, so only these look up their latest bill.
    SELECT DISTINCT pi.sku_id AS variant_id
    FROM public.purchase_bills pb
    INNER JOIN public.purchase_items pi ON pi.bill_id = pb.id
    WHERE v_supplier IS NOT NULL
      AND pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND public.normalize_product_brand_key(pb.supplier_name) = v_supplier
  ),
  invoice_hint AS (
    -- Variants bought at least once on a bill that passes the filter. Only these can have a
    -- latest purchase bill that passes it, so only these look up their latest bill.
    SELECT DISTINCT pi.sku_id AS variant_id
    FROM public.purchase_bills pb
    INNER JOIN public.purchase_items pi ON pi.bill_id = pb.id
    WHERE v_supplier_invoice IS NOT NULL
      AND pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND lower(trim(COALESCE(COALESCE(NULLIF(trim(pb.supplier_invoice_no), ''), NULLIF(trim(pb.software_bill_no), '')), ''))) = lower(v_supplier_invoice)
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
        OR v_search_matches_all
        OR (
          pv.id IN (SELECT sh.variant_id FROM search_hint sh)
          AND COALESCE((
        SELECT pb2.supplier_name
        FROM public.purchase_items pi2
        INNER JOIN public.purchase_bills pb2 ON pb2.id = pi2.bill_id
        WHERE pi2.sku_id = pv.id
          AND pi2.deleted_at IS NULL
          AND pb2.organization_id = p_org_id
          AND pb2.deleted_at IS NULL
        ORDER BY
          COALESCE(pb2.bill_date, pb2.created_at::date, pi2.created_at::date) DESC NULLS LAST,
          COALESCE(pb2.created_at, pi2.created_at) DESC NULLS LAST,
          pi2.created_at DESC,
          pi2.id DESC
        LIMIT 1
      ), '') ILIKE '%' || v_search || '%'
        )
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
        OR (
          pv.id IN (SELECT su.variant_id FROM supplier_hint su)
          AND public.normalize_product_brand_key((
        SELECT pb2.supplier_name
        FROM public.purchase_items pi2
        INNER JOIN public.purchase_bills pb2 ON pb2.id = pi2.bill_id
        WHERE pi2.sku_id = pv.id
          AND pi2.deleted_at IS NULL
          AND pb2.organization_id = p_org_id
          AND pb2.deleted_at IS NULL
        ORDER BY
          COALESCE(pb2.bill_date, pb2.created_at::date, pi2.created_at::date) DESC NULLS LAST,
          COALESCE(pb2.created_at, pi2.created_at) DESC NULLS LAST,
          pi2.created_at DESC,
          pi2.id DESC
        LIMIT 1
      )) = v_supplier
        )
      )
      AND (
        v_supplier_invoice IS NULL
        OR (
          pv.id IN (SELECT ih.variant_id FROM invoice_hint ih)
          AND lower(trim(COALESCE((
        SELECT COALESCE(NULLIF(trim(pb2.supplier_invoice_no), ''), NULLIF(trim(pb2.software_bill_no), ''))
        FROM public.purchase_items pi2
        INNER JOIN public.purchase_bills pb2 ON pb2.id = pi2.bill_id
        WHERE pi2.sku_id = pv.id
          AND pi2.deleted_at IS NULL
          AND pb2.organization_id = p_org_id
          AND pb2.deleted_at IS NULL
        ORDER BY
          COALESCE(pb2.bill_date, pb2.created_at::date, pi2.created_at::date) DESC NULLS LAST,
          COALESCE(pb2.created_at, pi2.created_at) DESC NULLS LAST,
          pi2.created_at DESC,
          pi2.id DESC
        LIMIT 1
      ), ''))) = lower(v_supplier_invoice)
        )
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
SET jit = off
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

  WITH supplier_hint AS (
    -- Variants bought at least once on a bill that passes the filter. Only these can have a
    -- latest purchase bill that passes it, so only these look up their latest bill.
    SELECT DISTINCT pi.sku_id AS variant_id
    FROM public.purchase_bills pb
    INNER JOIN public.purchase_items pi ON pi.bill_id = pb.id
    WHERE v_supplier IS NOT NULL
      AND pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND pb.supplier_name = v_supplier
  ),
  invoice_hint AS (
    -- Variants bought at least once on a bill that passes the filter. Only these can have a
    -- latest purchase bill that passes it, so only these look up their latest bill.
    SELECT DISTINCT pi.sku_id AS variant_id
    FROM public.purchase_bills pb
    INNER JOIN public.purchase_items pi ON pi.bill_id = pb.id
    WHERE v_supplier_invoice IS NOT NULL
      AND pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
      AND COALESCE(NULLIF(trim(pb.supplier_invoice_no), ''), NULLIF(trim(pb.software_bill_no), '')) = v_supplier_invoice
  ),
  base AS (
    SELECT
      COALESCE(pv.stock_qty, 0)::integer AS current_stock,
      COALESCE(pv.pur_price, 0) AS pur_price,
      pv.sale_price
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
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
      AND (
        v_supplier IS NULL
        OR (
          pv.id IN (SELECT su.variant_id FROM supplier_hint su)
          AND (
        SELECT pb2.supplier_name
        FROM public.purchase_items pi2
        INNER JOIN public.purchase_bills pb2 ON pb2.id = pi2.bill_id
        WHERE pi2.sku_id = pv.id
          AND pi2.deleted_at IS NULL
          AND pb2.organization_id = p_org_id
          AND pb2.deleted_at IS NULL
        ORDER BY
          COALESCE(pb2.bill_date, pb2.created_at::date, pi2.created_at::date) DESC NULLS LAST,
          COALESCE(pb2.created_at, pi2.created_at) DESC NULLS LAST,
          pi2.created_at DESC,
          pi2.id DESC
        LIMIT 1
      ) = v_supplier
        )
      )
      AND (
        v_supplier_invoice IS NULL
        OR (
          pv.id IN (SELECT ih.variant_id FROM invoice_hint ih)
          AND (
        SELECT COALESCE(NULLIF(trim(pb2.supplier_invoice_no), ''), NULLIF(trim(pb2.software_bill_no), ''))
        FROM public.purchase_items pi2
        INNER JOIN public.purchase_bills pb2 ON pb2.id = pi2.bill_id
        WHERE pi2.sku_id = pv.id
          AND pi2.deleted_at IS NULL
          AND pb2.organization_id = p_org_id
          AND pb2.deleted_at IS NULL
        ORDER BY
          COALESCE(pb2.bill_date, pb2.created_at::date, pi2.created_at::date) DESC NULLS LAST,
          COALESCE(pb2.created_at, pi2.created_at) DESC NULLS LAST,
          pi2.created_at DESC,
          pi2.id DESC
        LIMIT 1
      ) = v_supplier_invoice
        )
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

REVOKE EXECUTE ON FUNCTION public.get_stock_report(uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_report(uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.get_stock_report_filtered_totals(uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_report_filtered_totals(uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text, boolean) TO authenticated, service_role;
