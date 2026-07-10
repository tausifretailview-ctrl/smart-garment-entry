-- Product Dashboard: service products use virtual stock (999999) for POS billing only.
-- Dashboard grid shows qty 1; KPI cards exclude service stock from qty/value totals.

DROP FUNCTION IF EXISTS public.get_product_dashboard_stats(
  uuid, text, text, text, uuid, text, numeric, numeric
);

CREATE OR REPLACE FUNCTION public.get_product_dashboard_stats(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_product_type text DEFAULT NULL,
  p_size_group_id uuid DEFAULT NULL,
  p_stock_level text DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL
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

GRANT EXECUTE ON FUNCTION public.get_product_dashboard_stats(
  uuid, text, text, text, uuid, text, numeric, numeric
) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public.get_product_catalog_page(
  uuid, integer, integer, text, text, text, uuid, text, numeric, numeric
);

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
  p_max_price numeric DEFAULT NULL::numeric
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
  WITH base AS (
    SELECT p.id,
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
    FROM public.products p
    WHERE p.organization_id = p_org_id
      AND p.deleted_at IS NULL
      AND (p_category IS NULL OR p.category = p_category)
      AND (p_product_type IS NULL OR p.product_type = p_product_type)
      AND (p_size_group_id IS NULL OR p.size_group_id = p_size_group_id)
      AND (
        p_search IS NULL
        OR p.product_name ILIKE '%' || p_search || '%'
        OR COALESCE(p.brand, '') ILIKE '%' || p_search || '%'
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
  fast_page AS (
    SELECT b.*
    FROM base b
    WHERE p_stock_level IS NULL
      AND p_min_price IS NULL
      AND p_max_price IS NULL
    ORDER BY b.created_at DESC NULLS LAST, b.id
    OFFSET GREATEST((GREATEST(COALESCE(p_page, 1), 1) - 1) * GREATEST(COALESCE(p_page_size, 50), 1), 0)
    LIMIT GREATEST(COALESCE(p_page_size, 50), 1)
  ),
  fast_total AS (
    SELECT COUNT(*)::bigint AS c
    FROM base
    WHERE p_stock_level IS NULL
      AND p_min_price IS NULL
      AND p_max_price IS NULL
  ),
  fast_with_variants AS (
    SELECT fp.*,
           CASE
             WHEN fp.product_type = 'service' THEN 1::bigint
             ELSE COALESCE(agg.total_stock, 0)::bigint
           END AS total_stock,
           COALESCE(agg.variant_count, 0)::bigint AS variant_count,
           (SELECT c FROM fast_total) AS total_count
    FROM fast_page fp
    LEFT JOIN LATERAL (
      SELECT
        SUM(COALESCE(pv.stock_qty, 0))::bigint AS total_stock,
        COUNT(*)::bigint AS variant_count
      FROM public.product_variants pv
      WHERE pv.product_id = fp.id
        AND pv.organization_id = p_org_id
        AND pv.deleted_at IS NULL
    ) agg ON TRUE
  ),
  slow_totals AS (
    SELECT b.id AS product_id,
           b.product_type,
           b.created_at,
           CASE
             WHEN b.product_type = 'service' THEN 1::bigint
             ELSE COALESCE(SUM(COALESCE(pv.stock_qty, 0)), 0)::bigint
           END AS total_stock,
           COUNT(pv.id)::bigint AS variant_count,
           BOOL_OR(
             (p_min_price IS NULL OR COALESCE(pv.sale_price, 0) >= p_min_price)
             AND (p_max_price IS NULL OR COALESCE(pv.sale_price, 0) <= p_max_price)
           ) FILTER (WHERE pv.id IS NOT NULL) AS has_price_match
    FROM base b
    LEFT JOIN public.product_variants pv
      ON pv.product_id = b.id
     AND pv.organization_id = p_org_id
     AND pv.deleted_at IS NULL
    WHERE p_stock_level IS NOT NULL
       OR p_min_price IS NOT NULL
       OR p_max_price IS NOT NULL
    GROUP BY b.id, b.product_type, b.created_at
  ),
  slow_qualified AS (
    SELECT st.*
    FROM slow_totals st
    WHERE (
      p_stock_level IS NULL
      OR (p_stock_level = 'in_stock' AND (st.total_stock > 0 OR st.product_type = 'service'))
      OR (p_stock_level = 'low_stock' AND st.product_type <> 'service' AND st.total_stock BETWEEN 1 AND 10)
      OR (p_stock_level = 'out_of_stock' AND st.product_type <> 'service' AND st.total_stock = 0)
    )
    AND (
      (p_min_price IS NULL AND p_max_price IS NULL)
      OR COALESCE(st.has_price_match, FALSE)
    )
  ),
  slow_page AS (
    SELECT b.id,
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
           (SELECT COUNT(*)::bigint FROM slow_qualified) AS total_count
    FROM slow_qualified sq
    JOIN base b ON b.id = sq.product_id
    ORDER BY b.created_at DESC NULLS LAST, b.id
    OFFSET GREATEST((GREATEST(COALESCE(p_page, 1), 1) - 1) * GREATEST(COALESCE(p_page_size, 50), 1), 0)
    LIMIT GREATEST(COALESCE(p_page_size, 50), 1)
  )
  SELECT id,
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
  FROM fast_with_variants
  WHERE p_stock_level IS NULL
    AND p_min_price IS NULL
    AND p_max_price IS NULL
  UNION ALL
  SELECT id,
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
  FROM slow_page
  WHERE p_stock_level IS NOT NULL
     OR p_min_price IS NOT NULL
     OR p_max_price IS NOT NULL;
$function$;

GRANT EXECUTE ON FUNCTION public.get_product_catalog_page(
  uuid, integer, integer, text, text, text, uuid, text, numeric, numeric
) TO authenticated, service_role;
