CREATE OR REPLACE FUNCTION public.get_net_profit_kpis(p_org_id uuid, p_from_date date, p_to_date date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  -- IST business-day bounds, matching loadProfitDataset / npaTimestampBounds.
  v_from timestamptz := (p_from_date::text || 'T00:00:00.000+05:30')::timestamptz;
  v_to timestamptz := (p_to_date::text || 'T23:59:59.999+05:30')::timestamptz;
  v_result json;
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
      si.net_after_discount
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
    'invoice_count', (SELECT COUNT(*)::int FROM period_sales)
  )
  INTO v_result
  FROM sale_totals st
  CROSS JOIN return_totals rt;

  RETURN v_result;
END;
$function$;