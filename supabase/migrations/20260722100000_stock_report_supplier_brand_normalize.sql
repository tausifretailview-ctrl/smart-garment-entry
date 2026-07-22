-- Stock Report: restore supplier filters (regressed when in-stock sort dropped them),
-- match brand/supplier case/space-insensitively, and group Brand-wise stock by normalized brand.
-- Also: consolidate_duplicate_brands RPC for org-scoped brand spelling merge.

CREATE OR REPLACE FUNCTION public.normalize_product_brand_key(p_brand text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    lower(trim(regexp_replace(COALESCE(p_brand, ''), '[[:space:]]+', ' ', 'g'))),
    ''
  );
$$;

CREATE OR REPLACE FUNCTION public.canonicalize_product_brand(p_brand text)
RETURNS text
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT NULLIF(
    upper(trim(regexp_replace(COALESCE(p_brand, ''), '[[:space:]]+', ' ', 'g'))),
    ''
  );
$$;

GRANT EXECUTE ON FUNCTION public.normalize_product_brand_key(text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.canonicalize_product_brand(text) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- get_stock_report — supplier + in/low stock + normalized brand/supplier match
-- ---------------------------------------------------------------------------
DROP FUNCTION IF EXISTS public.get_stock_report(
  uuid, integer, integer, text, text, text, boolean, text, text, text, text
);
DROP FUNCTION IF EXISTS public.get_stock_report(
  uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer
);
DROP FUNCTION IF EXISTS public.get_stock_report(
  uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text
);

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
  p_supplier_invoice text DEFAULT NULL
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
      COALESCE(pv.stock_qty, 0)::integer AS current_stock
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
  purchased AS (
    SELECT
      pi.sku_id AS variant_id,
      COALESCE(SUM(pi.qty), 0)::numeric AS qty
    FROM public.purchase_items pi
    INNER JOIN base b ON b.variant_id = pi.sku_id
    WHERE pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  sold AS (
    SELECT
      si.variant_id,
      COALESCE(SUM(si.quantity), 0)::numeric AS qty
    FROM public.sale_items si
    INNER JOIN base b ON b.variant_id = si.variant_id
    WHERE si.deleted_at IS NULL
      AND si.variant_id IS NOT NULL
    GROUP BY si.variant_id
  ),
  purchase_returned AS (
    SELECT
      pri.sku_id AS variant_id,
      COALESCE(SUM(pri.qty), 0)::numeric AS qty
    FROM public.purchase_return_items pri
    INNER JOIN base b ON b.variant_id = pri.sku_id
    WHERE pri.deleted_at IS NULL
      AND pri.sku_id IS NOT NULL
    GROUP BY pri.sku_id
  ),
  sale_returned AS (
    SELECT
      sri.variant_id,
      COALESCE(SUM(sri.quantity), 0)::numeric AS qty
    FROM public.sale_return_items sri
    INNER JOIN base b ON b.variant_id = sri.variant_id
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
      COUNT(*) OVER ()::bigint AS total_rows
    FROM base b
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
  ORDER BY e.current_stock DESC, e.product_name, e.size
  LIMIT v_limit
  OFFSET v_offset;
END;
$$;

COMMENT ON FUNCTION public.get_stock_report(
  uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text
) IS
  'Paginated Stock Report — supplier/invoice filters; brand/supplier match ignores case/extra spaces.';

GRANT EXECUTE ON FUNCTION public.get_stock_report(
  uuid, integer, integer, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- filtered totals — same normalized matching
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
  v_category text := public.normalize_product_brand_key(p_category);
  v_brand text := public.normalize_product_brand_key(p_brand);
  v_style text := public.normalize_product_brand_key(p_style);
  v_size text := NULLIF(trim(COALESCE(p_size, '')), '');
  v_color text := NULLIF(trim(COALESCE(p_color, '')), '');
  v_product_name text := NULLIF(trim(COALESCE(p_product_name, '')), '');
  v_supplier text := public.normalize_product_brand_key(p_supplier);
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

GRANT EXECUTE ON FUNCTION public.get_stock_report_filtered_totals(
  uuid, text, text, text, boolean, text, text, text, text, boolean, boolean, integer, text, text
) TO authenticated, service_role;

-- ---------------------------------------------------------------------------
-- consolidate_duplicate_brands — merge spellings for current org
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.consolidate_duplicate_brands(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_products_updated integer := 0;
  v_discounts_updated integer := 0;
  v_groups integer := 0;
  v_n integer := 0;
  r record;
  v_canonical text;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_org_id IS NULL
       OR NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR r IN
    SELECT
      public.normalize_product_brand_key(p.brand) AS brand_key,
      (array_agg(p.brand ORDER BY length(p.brand) DESC, p.brand))[1] AS top_raw
    FROM public.products p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND p.brand IS NOT NULL
      AND trim(p.brand) <> ''
    GROUP BY public.normalize_product_brand_key(p.brand)
    HAVING count(DISTINCT p.brand) > 1
  LOOP
    v_groups := v_groups + 1;
    v_canonical := public.canonicalize_product_brand(r.top_raw);

    UPDATE public.products p
    SET brand = v_canonical
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND public.normalize_product_brand_key(p.brand) = r.brand_key
      AND p.brand IS DISTINCT FROM v_canonical;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_products_updated := v_products_updated + v_n;

    UPDATE public.customer_brand_discounts d
    SET brand = v_canonical
    WHERE d.organization_id = p_org_id
      AND public.normalize_product_brand_key(d.brand) = r.brand_key
      AND d.brand IS DISTINCT FROM v_canonical;
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_discounts_updated := v_discounts_updated + v_n;
  END LOOP;

  RETURN json_build_object(
    'groups_merged', v_groups,
    'products_updated', v_products_updated,
    'discounts_updated', v_discounts_updated
  );
END;
$$;

COMMENT ON FUNCTION public.consolidate_duplicate_brands(uuid) IS
  'Merge product brand spellings that differ only by case/spaces within one organization.';

GRANT EXECUTE ON FUNCTION public.consolidate_duplicate_brands(uuid) TO authenticated, service_role;
