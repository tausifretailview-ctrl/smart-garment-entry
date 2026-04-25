-- 1) Covering index for per-product variant aggregation
CREATE INDEX IF NOT EXISTS idx_product_variants_product_org_active
  ON public.product_variants (product_id, organization_id)
  INCLUDE (stock_qty)
  WHERE deleted_at IS NULL;

-- 2) Replace correlated subqueries with single LATERAL aggregation
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
 RETURNS TABLE(product_id uuid, product_name text, product_type text, category text, brand text, style text, color text, image_url text, hsn_code text, gst_per integer, default_pur_price numeric, default_sale_price numeric, status text, size_group_id uuid, total_stock bigint, variant_count bigint, total_count bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public', 'pg_temp'
AS $function$
  with base as (
    select p.id, p.product_name, p.product_type, p.category, p.brand, p.style, p.color,
           p.image_url, p.hsn_code, p.gst_per, p.default_pur_price, p.default_sale_price,
           p.status, p.size_group_id, p.created_at
    from public.products p
    where p.organization_id = p_org_id
      and p.deleted_at is null
      and (p_category is null or p.category = p_category)
      and (p_product_type is null or p.product_type = p_product_type)
      and (p_size_group_id is null or p.size_group_id = p_size_group_id)
      and (
        p_search is null
        or p.product_name ilike '%' || p_search || '%'
        or coalesce(p.brand, '') ilike '%' || p_search || '%'
        or exists (
          select 1 from public.product_variants pv
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
    offset greatest((greatest(coalesce(p_page,1),1) - 1) * greatest(coalesce(p_page_size,50),1), 0)
    limit greatest(coalesce(p_page_size,50), 1)
  ),
  fast_total as (
    select count(*)::bigint as c
    from base
    where p_stock_level is null and p_min_price is null and p_max_price is null
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
    ) agg on true
  ),
  slow_totals as (
    select b.id as product_id, b.created_at,
           coalesce(sum(coalesce(pv.stock_qty,0)),0)::bigint as total_stock,
           count(pv.id)::bigint as variant_count,
           bool_or(
             (p_min_price is null or coalesce(pv.sale_price,0) >= p_min_price)
             and (p_max_price is null or coalesce(pv.sale_price,0) <= p_max_price)
           ) filter (where pv.id is not null) as has_price_match
    from base b
    left join public.product_variants pv
      on pv.product_id = b.id and pv.organization_id = p_org_id and pv.deleted_at is null
    where p_stock_level is not null or p_min_price is not null or p_max_price is not null
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
    select b.id, b.product_name, b.product_type, b.category, b.brand, b.style, b.color,
           b.image_url, b.hsn_code, b.gst_per, b.default_pur_price, b.default_sale_price,
           b.status, b.size_group_id,
           sq.total_stock, sq.variant_count,
           (select count(*)::bigint from slow_qualified) as total_count
    from slow_qualified sq
    join base b on b.id = sq.product_id
    order by b.created_at desc nulls last, b.id
    offset greatest((greatest(coalesce(p_page,1),1) - 1) * greatest(coalesce(p_page_size,50),1), 0)
    limit greatest(coalesce(p_page_size,50), 1)
  )
  select id, product_name, product_type, category, brand, style, color,
         image_url, hsn_code, gst_per, default_pur_price, default_sale_price,
         status, size_group_id, total_stock, variant_count, total_count
  from fast_with_variants
  where p_stock_level is null and p_min_price is null and p_max_price is null
  union all
  select id, product_name, product_type, category, brand, style, color,
         image_url, hsn_code, gst_per, default_pur_price, default_sale_price,
         status, size_group_id, total_stock, variant_count, total_count
  from slow_page
  where p_stock_level is not null or p_min_price is not null or p_max_price is not null;
$function$;