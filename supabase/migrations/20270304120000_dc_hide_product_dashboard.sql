-- Product Dashboard (Product Master) honors p_hide_dc (2026-10-24, DC show / hide mode).
--
-- With p_hide_dc = true (Settings > Purchase "Hide DC", or Ctrl+Shift+H in Show mode):
--   * a product whose every barcode is DC (product_variants.is_dc_product) is not listed or counted;
--   * a product with GST and DC barcodes is listed with its GST barcodes' stock / count / value only.
-- Without p_hide_dc (every existing caller) the results are exactly as before.
-- Bodies are the latest definitions (20260710100000 stats, 20260912140000 catalog page) plus the
-- p_hide_dc lines. Both stay SECURITY INVOKER (RLS applies). Safe to run again.

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
     AND (p_hide_dc IS DISTINCT FROM true OR COALESCE(pv.is_dc_product, false) = false)
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
  uuid, text, text, text, uuid, text, numeric, numeric, boolean
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
        and (p_hide_dc is distinct from true or coalesce(pv.is_dc_product, false) = false)
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
     and (p_hide_dc is distinct from true or coalesce(pv.is_dc_product, false) = false)
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

COMMENT ON FUNCTION public.get_product_catalog_page(uuid, integer, integer, text, text, text, uuid, text, numeric, numeric, boolean) IS
  'Paginated Product Master rows with variant aggregates and user_cancelled_at; p_hide_dc leaves DC barcodes out.';

GRANT EXECUTE ON FUNCTION public.get_product_catalog_page(uuid, integer, integer, text, text, text, uuid, text, numeric, numeric, boolean)
  TO authenticated, service_role;
