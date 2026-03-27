create extension if not exists pg_trgm;

create or replace function public.get_product_catalog_page(
  p_org_id uuid,
  p_page integer default 1,
  p_page_size integer default 50,
  p_search text default null,
  p_category text default null,
  p_product_type text default null,
  p_size_group_id uuid default null,
  p_stock_level text default null,
  p_min_price numeric default null,
  p_max_price numeric default null
)
returns table (
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
  total_count bigint
)
language sql
stable
set search_path = public
as $$
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

create or replace function public.get_product_dashboard_stats(
  p_org_id uuid,
  p_search text default null,
  p_category text default null,
  p_product_type text default null,
  p_size_group_id uuid default null,
  p_stock_level text default null,
  p_min_price numeric default null,
  p_max_price numeric default null
)
returns jsonb
language sql
stable
set search_path = public
as $$
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

create index if not exists idx_products_org_created_active
  on public.products (organization_id, created_at desc, id)
  where deleted_at is null;

create index if not exists idx_products_org_category_active
  on public.products (organization_id, category)
  where deleted_at is null and category is not null;

create index if not exists idx_products_org_product_type_active
  on public.products (organization_id, product_type)
  where deleted_at is null and product_type is not null;

create index if not exists idx_products_org_size_group_active
  on public.products (organization_id, size_group_id)
  where deleted_at is null and size_group_id is not null;

create index if not exists idx_product_variants_org_product_active
  on public.product_variants (organization_id, product_id)
  where deleted_at is null;

create index if not exists idx_product_variants_barcode_trgm
  on public.product_variants using gin (barcode gin_trgm_ops)
  where deleted_at is null and barcode is not null;