
CREATE OR REPLACE FUNCTION public.get_product_catalog_page(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_category text DEFAULT NULL,
  p_product_type text DEFAULT NULL,
  p_size_group_id uuid DEFAULT NULL,
  p_stock_level text DEFAULT NULL,
  p_min_price numeric DEFAULT NULL,
  p_max_price numeric DEFAULT NULL,
  p_page integer DEFAULT 1,
  p_page_size integer DEFAULT 50
)
RETURNS TABLE (
  product_id uuid,
  product_name text,
  product_type text,
  category text,
  brand text,
  style text,
  color text,
  image_url text,
  hsn_code text,
  gst_per numeric,
  default_pur_price numeric,
  default_sale_price numeric,
  status text,
  size_group_id uuid,
  total_stock bigint,
  variant_count bigint,
  total_count bigint
)
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  with filtered_products as (
    select
      p.id,
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
      p.created_at
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
        or coalesce(p.style, '') ilike '%' || p_search || '%'
        or coalesce(p.category, '') ilike '%' || p_search || '%'
        or coalesce(p.color, '') ilike '%' || p_search || '%'
        or coalesce(p.hsn_code, '') ilike '%' || p_search || '%'
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
  product_totals as (
    select
      fp.id as product_id,
      coalesce(sum(coalesce(pv.stock_qty, 0)), 0)::bigint as total_stock,
      count(pv.id)::bigint as variant_count,
      bool_or(
        (p_min_price is null or coalesce(pv.sale_price, 0) >= p_min_price)
        and (p_max_price is null or coalesce(pv.sale_price, 0) <= p_max_price)
      ) filter (where pv.id is not null) as has_price_match
    from filtered_products fp
    left join public.product_variants pv
      on pv.product_id = fp.id
     and pv.organization_id = p_org_id
     and pv.deleted_at is null
    group by fp.id
  ),
  qualified_products as (
    select
      fp.*, 
      pt.total_stock,
      pt.variant_count
    from filtered_products fp
    join product_totals pt on pt.product_id = fp.id
    where (
      p_stock_level is null
      or (p_stock_level = 'in_stock' and pt.total_stock > 0)
      or (p_stock_level = 'low_stock' and pt.total_stock between 1 and 10)
      or (p_stock_level = 'out_of_stock' and pt.total_stock = 0)
    )
    and (
      (p_min_price is null and p_max_price is null)
      or coalesce(pt.has_price_match, false)
    )
  )
  select
    qp.id as product_id,
    qp.product_name,
    qp.product_type,
    qp.category,
    qp.brand,
    qp.style,
    qp.color,
    qp.image_url,
    qp.hsn_code,
    qp.gst_per,
    qp.default_pur_price,
    qp.default_sale_price,
    qp.status,
    qp.size_group_id,
    qp.total_stock,
    qp.variant_count,
    count(*) over()::bigint as total_count
  from qualified_products qp
  order by qp.created_at desc nulls last, qp.id
  offset greatest((greatest(coalesce(p_page, 1), 1) - 1) * greatest(coalesce(p_page_size, 50), 1), 0)
  limit greatest(coalesce(p_page_size, 50), 1);
$$;

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
LANGUAGE sql STABLE SECURITY INVOKER
AS $$
  with filtered_products as (
    select p.id
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
        or coalesce(p.style, '') ilike '%' || p_search || '%'
        or coalesce(p.category, '') ilike '%' || p_search || '%'
        or coalesce(p.color, '') ilike '%' || p_search || '%'
        or coalesce(p.hsn_code, '') ilike '%' || p_search || '%'
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
  product_totals as (
    select
      fp.id as product_id,
      coalesce(sum(coalesce(pv.stock_qty, 0)), 0)::bigint as total_stock,
      count(pv.id)::bigint as variant_count,
      coalesce(sum(coalesce(pv.stock_qty, 0) * coalesce(pv.pur_price, 0)), 0)::numeric as purchase_value,
      coalesce(sum(coalesce(pv.stock_qty, 0) * coalesce(pv.sale_price, 0)), 0)::numeric as sale_value,
      bool_or(
        (p_min_price is null or coalesce(pv.sale_price, 0) >= p_min_price)
        and (p_max_price is null or coalesce(pv.sale_price, 0) <= p_max_price)
      ) filter (where pv.id is not null) as has_price_match
    from filtered_products fp
    left join public.product_variants pv
      on pv.product_id = fp.id
     and pv.organization_id = p_org_id
     and pv.deleted_at is null
    group by fp.id
  ),
  qualified_products as (
    select *
    from product_totals pt
    where (
      p_stock_level is null
      or (p_stock_level = 'in_stock' and pt.total_stock > 0)
      or (p_stock_level = 'low_stock' and pt.total_stock between 1 and 10)
      or (p_stock_level = 'out_of_stock' and pt.total_stock = 0)
    )
    and (
      (p_min_price is null and p_max_price is null)
      or coalesce(pt.has_price_match, false)
    )
  )
  select jsonb_build_object(
    'total_products', count(*)::bigint,
    'total_items', coalesce(sum(variant_count), 0)::bigint,
    'total_stock_qty', coalesce(sum(total_stock), 0)::bigint,
    'purchase_value', coalesce(sum(purchase_value), 0)::numeric,
    'sale_value', coalesce(sum(sale_value), 0)::numeric
  )
  from qualified_products;
$$;
