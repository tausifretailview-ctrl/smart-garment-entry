-- Dashboard Gross Profit after sale returns (DEMO 1 Nov 2026).
--
-- get_net_profit_kpis kept gross_profit = sales net − COGS and ignored returns, so the
-- Main Dashboard showed ₹148 while Net Profit Analysis "S/R Adjusted" showed ₹50
-- (₹798 return off sales, ₹700 cost of the returned piece back to stock).
--
-- Adds S/R Adjusted fields; existing fields are unchanged:
--   return_cogs            cost of returned goods (avg purchase rate, same as sale lines)
--   amount_only_returns    "Old sale return" credit notes with no item rows (no cost back)
--   net_sales_after_sr     net_sales − return_amount − amount_only_returns
--   total_cogs_after_sr    total_cogs − return_cogs
--   gross_profit_after_sr  net_sales_after_sr − total_cogs_after_sr
--   margin_after_sr        on net_sales_after_sr
-- Same signature, so existing grants stay.

-- get_net_profit_kpis
CREATE OR REPLACE FUNCTION public.get_net_profit_kpis(
  p_org_id uuid,
  p_from_date date,
  p_to_date date,
  p_hide_dc boolean DEFAULT false
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
  -- DC User login (User Rights "DC only"): only DC lines and bills with a DC line.
  v_only_dc boolean := public.dc_only_user(p_org_id);
  v_hide boolean := COALESCE(p_hide_dc, false) AND NOT v_only_dc;
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
      -- DC hidden: bills whose every line is DC are left out.
      AND NOT (v_hide AND COALESCE(s.is_dc_bill, false))
      -- DC only: bills with at least one DC line.
      AND (
        NOT v_only_dc
        OR EXISTS (
          SELECT 1 FROM public.sale_items di
          WHERE di.sale_id = s.id AND di.is_dc_item = true AND di.deleted_at IS NULL
        )
      )
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
      si.net_after_discount,
      COALESCE(si.is_dc_item, false) AS is_dc
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
  -- Returns dated in the period (same rows as return_amount below).
  return_lines AS (
    SELECT
      sri.variant_id,
      sri.product_id,
      COALESCE(sri.quantity, 0)::numeric AS quantity,
      ABS(COALESCE(sri.line_total, 0))::numeric AS amount
    FROM public.sale_returns sr
    JOIN public.sale_return_items sri ON sri.return_id = sr.id
    WHERE sr.organization_id = p_org_id
      AND sr.deleted_at IS NULL
      AND sr.return_date >= v_from
      AND sr.return_date <= v_to
      AND NOT (COALESCE(sri.quantity, 0) = 0 AND COALESCE(sri.line_total, 0) = 0)
      AND NOT (v_hide AND COALESCE(sri.is_dc_item, false))
      AND NOT (v_only_dc AND NOT COALESCE(sri.is_dc_item, false))
  ),
  variant_avg AS (
    SELECT
      pi.sku_id,
      SUM(COALESCE(pi.pur_price, 0) * COALESCE(NULLIF(pi.qty, 0), 1))
        / NULLIF(SUM(COALESCE(NULLIF(pi.qty, 0), 1)), 0) AS avg_pur
    FROM public.purchase_items pi
    WHERE pi.deleted_at IS NULL
      AND pi.sku_id IN (
        SELECT variant_id FROM sale_lines WHERE variant_id IS NOT NULL
        UNION
        SELECT variant_id FROM return_lines WHERE variant_id IS NOT NULL
      )
    GROUP BY pi.sku_id
  ),
  line_cogs AS (
    SELECT
      ln.is_dc,
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
    -- DC lines still count in each bill's discount base above, so other lines keep their share.
    WHERE NOT (v_hide AND is_dc)
      AND NOT (v_only_dc AND NOT is_dc)
  ),
  return_totals AS (
    SELECT COALESCE(SUM(amount), 0) AS return_amount
    FROM return_lines
  ),
  -- Cost of the returned goods (they go back to stock): same rate as a sale line.
  return_cogs_totals AS (
    SELECT COALESCE(SUM(
      CASE
        WHEN COALESCE(p.product_type, 'goods') = 'service' OR rl.variant_id IS NULL THEN 0
        ELSE rl.quantity * COALESCE(NULLIF(va.avg_pur, 0), pv.pur_price, 0)
      END
    ), 0) AS return_cogs
    FROM return_lines rl
    LEFT JOIN public.product_variants pv
      ON pv.id = rl.variant_id
     AND pv.organization_id = p_org_id
    LEFT JOIN public.products p
      ON p.id = COALESCE(rl.product_id, pv.product_id)
     AND p.organization_id = p_org_id
    LEFT JOIN variant_avg va ON va.sku_id = rl.variant_id
  ),
  -- Amount-only returns ("Old sale return" from POS S/R Adj) have no item rows and
  -- no cost to add back; their credit value still comes off sales. DC User never sees them.
  amount_only_returns AS (
    SELECT COALESCE(SUM(ABS(COALESCE(sr.net_amount, 0))), 0) AS amount
    FROM public.sale_returns sr
    WHERE sr.organization_id = p_org_id
      AND sr.deleted_at IS NULL
      AND sr.return_date >= v_from
      AND sr.return_date <= v_to
      AND NOT v_only_dc
      AND COALESCE(sr.net_amount, 0) <> 0
      AND NOT EXISTS (SELECT 1 FROM public.sale_return_items x WHERE x.return_id = sr.id)
  ),
  sr_adjusted AS (
    SELECT
      st.net_sales - rt.return_amount - ao.amount AS net_after_sr,
      st.total_cogs - rc.return_cogs AS cogs_after_sr,
      rc.return_cogs,
      ao.amount AS amount_only_returns
    FROM sale_totals st
    CROSS JOIN return_totals rt
    CROSS JOIN return_cogs_totals rc
    CROSS JOIN amount_only_returns ao
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
    'invoice_count', (SELECT COUNT(*)::int FROM period_sales),
    -- S/R Adjusted (Net Profit Analysis "S/R Adjusted" view): what the dashboards show.
    'sr_adjusted', true,
    'return_cogs', sa.return_cogs,
    'amount_only_returns', sa.amount_only_returns,
    'net_sales_after_sr', sa.net_after_sr,
    'total_cogs_after_sr', sa.cogs_after_sr,
    'gross_profit_after_sr', sa.net_after_sr - sa.cogs_after_sr,
    'margin_after_sr', CASE WHEN sa.net_after_sr <> 0 THEN ((sa.net_after_sr - sa.cogs_after_sr) / sa.net_after_sr) * 100 ELSE 0 END,
    'dcHideApplied', v_hide,
    'dcOnlyApplied', v_only_dc
  )
  INTO v_result
  FROM sale_totals st
  CROSS JOIN return_totals rt
  CROSS JOIN sr_adjusted sa;

  RETURN v_result;
END;
$$;
