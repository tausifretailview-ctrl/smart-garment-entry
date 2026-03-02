CREATE OR REPLACE FUNCTION public.get_erp_dashboard_stats(
  p_org_id uuid,
  p_start_date date,
  p_end_date date
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
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
  v_profit NUMERIC := 0;
  v_sr_total NUMERIC := 0;
  v_sr_count INT := 0;
  v_sr_qty INT := 0;
  v_pr_total NUMERIC := 0;
  v_pr_count INT := 0;
  v_pr_qty INT := 0;
BEGIN
  -- Sales summary (date-filtered)
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

  -- Cash collection: prefer cash, fallback to paid
  v_cash := COALESCE(NULLIF(v_total_cash, 0), v_total_paid);

  -- Purchase summary (date-filtered)
  SELECT
    COALESCE(SUM(bill_count), 0)::int,
    COALESCE(SUM(total_purchase_amount), 0),
    COALESCE(SUM(total_items_purchased), 0)::int
  INTO v_purchase_count, v_purchase_total, v_purchase_qty
  FROM v_dashboard_purchase_summary
  WHERE organization_id = p_org_id
    AND purchase_day >= p_start_date
    AND purchase_day <= p_end_date;

  -- Counts (not date-filtered)
  SELECT
    COALESCE(customer_count, 0)::int,
    COALESCE(supplier_count, 0)::int,
    COALESCE(product_count, 0)::int
  INTO v_customer_count, v_supplier_count, v_product_count
  FROM v_dashboard_counts
  WHERE organization_id = p_org_id;

  -- Stock summary (not date-filtered)
  SELECT
    COALESCE(total_stock_qty, 0)::int,
    COALESCE(total_stock_value, 0)
  INTO v_stock_qty, v_stock_value
  FROM v_dashboard_stock_summary
  WHERE organization_id = p_org_id;

  -- Receivables (not date-filtered)
  SELECT
    COALESCE(total_receivables, 0),
    COALESCE(pending_count, 0)::int
  INTO v_receivables_total, v_pending_count
  FROM v_dashboard_receivables
  WHERE organization_id = p_org_id;

  -- Gross profit (date-filtered)
  SELECT COALESCE(SUM(gross_profit), 0)
  INTO v_profit
  FROM v_dashboard_gross_profit
  WHERE organization_id = p_org_id
    AND sale_day >= p_start_date
    AND sale_day <= p_end_date;

  -- Sale returns (date-filtered)
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

  -- Purchase returns (date-filtered)
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

  -- Build result JSON
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
    'gross_profit', v_profit,
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