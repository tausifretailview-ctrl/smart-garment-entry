-- Totals-only Net Profit KPIs matching loadProfitDataset / computeSaleLineRevenue /
-- lineCogs (src/utils/netProfitAnalysis.ts). Do NOT patch v_dashboard_gross_profit.
-- get_erp_dashboard_stats stops reading that view; dashboards call this RPC instead.

CREATE OR REPLACE FUNCTION public.get_net_profit_kpis(
  p_org_id uuid,
  p_from_date date,
  p_to_date date
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
$$;

COMMENT ON FUNCTION public.get_net_profit_kpis(uuid, date, date) IS
  'Totals-only NPA KPIs (MRP gross, header disc without round-off, net before sale-return adjust, qty-weighted purchase_items COGS, returns informational). Date bounds match loadProfitDataset. SECURITY DEFINER, fail-closed org guard.';

REVOKE ALL ON FUNCTION public.get_net_profit_kpis(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_net_profit_kpis(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_net_profit_kpis(uuid, date, date) TO authenticated, service_role;

-- Stop reading v_dashboard_gross_profit (current-pur_price COGS, returns punched into
-- net). gross_profit is returned as JSON null; use get_net_profit_kpis instead.
CREATE OR REPLACE FUNCTION public.get_erp_dashboard_stats(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
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

  v_cash := COALESCE(NULLIF(v_total_cash, 0), v_total_paid);

  SELECT
    COALESCE(SUM(bill_count), 0)::int,
    COALESCE(SUM(total_purchase_amount), 0),
    COALESCE(SUM(total_items_purchased), 0)::int
  INTO v_purchase_count, v_purchase_total, v_purchase_qty
  FROM v_dashboard_purchase_summary
  WHERE organization_id = p_org_id
    AND purchase_day >= p_start_date
    AND purchase_day <= p_end_date;

  SELECT
    COALESCE(customer_count, 0)::int,
    COALESCE(supplier_count, 0)::int,
    COALESCE(product_count, 0)::int
  INTO v_customer_count, v_supplier_count, v_product_count
  FROM v_dashboard_counts
  WHERE organization_id = p_org_id;

  SELECT
    COALESCE(total_stock_qty, 0)::int,
    COALESCE(total_stock_value, 0)
  INTO v_stock_qty, v_stock_value
  FROM v_dashboard_stock_summary
  WHERE organization_id = p_org_id;

  SELECT
    COALESCE(total_receivables, 0),
    COALESCE(pending_count, 0)::int
  INTO v_receivables_total, v_pending_count
  FROM v_dashboard_receivables
  WHERE organization_id = p_org_id;

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

  SELECT
    COALESCE(SUM(net_amount), 0),
    COUNT(*)::int
  INTO v_pr_total, v_pr_count
  FROM purchase_returns
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND return_date >= p_start_date
    AND return_date <= p_end_date;

  IF v_pr_count > 0 THEN
    SELECT COALESCE(SUM(pri.qty), 0)::int
    INTO v_pr_qty
    FROM purchase_return_items pri
    INNER JOIN purchase_returns pr ON pr.id = pri.return_id
    WHERE pr.organization_id = p_org_id
      AND pr.deleted_at IS NULL
      AND pr.return_date >= p_start_date
      AND pr.return_date <= p_end_date;
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
    'purchase_return_qty', v_pr_qty
  );

  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.get_erp_dashboard_stats(uuid, date, date) IS
  'Dashboard stored-net tiles (v_dashboard_sales_summary). gross_profit is always null — use get_net_profit_kpis for NPA-net profit. SECURITY DEFINER, fail-closed org guard.';

REVOKE ALL ON FUNCTION public.get_erp_dashboard_stats(uuid, date, date) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_erp_dashboard_stats(uuid, date, date) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_erp_dashboard_stats(uuid, date, date) TO authenticated, service_role;
