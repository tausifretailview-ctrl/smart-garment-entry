-- Close the fail-open org guard on two SECURITY DEFINER Insights RPCs.
-- Both shipped with:
--   IF auth.uid() IS NOT NULL THEN
--     IF NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN RAISE ...
--   END IF;
-- An anonymous caller has auth.uid() = NULL, so the check is skipped and SECURITY DEFINER
-- bypasses RLS. Replace with the auth.role() four-way discriminator:
--   anon            -> reject
--   authenticated   -> require org membership
--   service_role    -> pass
--   NULL            -> in-database caller (trigger / pg_cron) -> pass
-- Query bodies are unchanged (velocity, last-purchase, filters).

CREATE OR REPLACE FUNCTION public.get_low_stock_alerts(
  p_org_id    uuid,
  p_threshold integer DEFAULT 5
)
RETURNS TABLE (
  variant_id         uuid,
  product_id         uuid,
  product_name       text,
  brand              text,
  category           text,
  size               text,
  color              text,
  barcode            text,
  current_stock      numeric,
  avg_daily_sales    numeric,
  days_of_stock_left numeric,
  last_purchase_date date,
  primary_supplier   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH daily_sales AS (
    SELECT
      si.variant_id,
      SUM(si.quantity)::numeric
        / GREATEST(
            CURRENT_DATE - MIN(s.sale_date::date),
            1
          )                         AS avg_daily_sales
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND si.variant_id IS NOT NULL
      AND s.sale_date::date >= CURRENT_DATE - 30
    GROUP BY si.variant_id
  ),
  last_purchase AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id                     AS variant_id,
      pb.bill_date                  AS last_purchase_date,
      COALESCE(sup.supplier_name, pb.supplier_name) AS primary_supplier
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    LEFT JOIN public.suppliers sup ON sup.id = pb.supplier_id
    WHERE pb.organization_id = p_org_id
      AND pi.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND COALESCE(pb.is_cancelled, false) = false
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pb.bill_date DESC, pb.created_at DESC
  )
  SELECT
    pv.id                           AS variant_id,
    p.id                            AS product_id,
    p.product_name,
    p.brand,
    p.category,
    pv.size,
    pv.color,
    pv.barcode,
    pv.stock_qty::numeric           AS current_stock,
    COALESCE(ds.avg_daily_sales, 0) AS avg_daily_sales,
    CASE
      WHEN COALESCE(ds.avg_daily_sales, 0) = 0 THEN NULL
      ELSE ROUND(pv.stock_qty / ds.avg_daily_sales, 1)
    END                             AS days_of_stock_left,
    lp.last_purchase_date,
    lp.primary_supplier
  FROM public.product_variants pv
  INNER JOIN public.products p ON p.id = pv.product_id
  LEFT JOIN daily_sales ds ON ds.variant_id = pv.id
  LEFT JOIN last_purchase lp ON lp.variant_id = pv.id
  WHERE pv.organization_id = p_org_id
    AND p.organization_id = p_org_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active IS DISTINCT FROM false
    AND p.product_type IS DISTINCT FROM 'service'
    AND pv.stock_qty <= p_threshold
  ORDER BY
    CASE
      WHEN COALESCE(ds.avg_daily_sales, 0) = 0 THEN 9999
      ELSE pv.stock_qty / ds.avg_daily_sales
    END ASC NULLS LAST;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_slow_moving_stock(
  p_org_id         uuid,
  p_days_threshold integer DEFAULT 60
)
RETURNS TABLE (
  variant_id         uuid,
  product_id         uuid,
  product_name       text,
  brand              text,
  category           text,
  size               text,
  color              text,
  barcode            text,
  current_stock      numeric,
  stock_value        numeric,
  last_sold_date     date,
  days_since_sold    integer,
  total_sold_ever    numeric,
  last_purchase_date date,
  primary_supplier   text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;

  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH last_sale AS (
    SELECT
      si.variant_id,
      MAX(s.sale_date::date)        AS last_sold_date,
      SUM(si.quantity)              AS total_sold_ever
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_org_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND si.variant_id IS NOT NULL
    GROUP BY si.variant_id
  ),
  last_purchase AS (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id                     AS variant_id,
      pb.bill_date                  AS last_purchase_date,
      COALESCE(sup.supplier_name, pb.supplier_name) AS primary_supplier
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    LEFT JOIN public.suppliers sup ON sup.id = pb.supplier_id
    WHERE pb.organization_id = p_org_id
      AND pi.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND COALESCE(pb.is_cancelled, false) = false
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pb.bill_date DESC, pb.created_at DESC
  )
  SELECT
    pv.id                           AS variant_id,
    p.id                            AS product_id,
    p.product_name,
    p.brand,
    p.category,
    pv.size,
    pv.color,
    pv.barcode,
    pv.stock_qty::numeric           AS current_stock,
    (pv.stock_qty * COALESCE(pv.pur_price, 0))::numeric AS stock_value,
    ls.last_sold_date,
    CASE
      WHEN ls.last_sold_date IS NULL THEN NULL
      ELSE (CURRENT_DATE - ls.last_sold_date::date)
    END                             AS days_since_sold,
    COALESCE(ls.total_sold_ever, 0) AS total_sold_ever,
    lp.last_purchase_date,
    lp.primary_supplier
  FROM public.product_variants pv
  INNER JOIN public.products p ON p.id = pv.product_id
  LEFT JOIN last_sale ls ON ls.variant_id = pv.id
  LEFT JOIN last_purchase lp ON lp.variant_id = pv.id
  WHERE pv.organization_id = p_org_id
    AND p.organization_id = p_org_id
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active IS DISTINCT FROM false
    AND pv.stock_qty > 0
    AND p.product_type IS DISTINCT FROM 'service'
    AND (
      ls.last_sold_date IS NULL
      OR ls.last_sold_date < CURRENT_DATE - p_days_threshold
    )
  ORDER BY (pv.stock_qty * COALESCE(pv.pur_price, 0)) DESC NULLS LAST;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.get_low_stock_alerts(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_low_stock_alerts(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_low_stock_alerts(uuid, integer) TO authenticated, service_role;

REVOKE EXECUTE ON FUNCTION public.get_slow_moving_stock(uuid, integer) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_slow_moving_stock(uuid, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_slow_moving_stock(uuid, integer) TO authenticated, service_role;
