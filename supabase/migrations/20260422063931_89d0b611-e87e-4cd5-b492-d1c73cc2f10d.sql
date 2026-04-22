-- FIX 1+2: Update get_pnl_aggregates - exclude cancelled/negative sales, deduct sale_return_adjust
CREATE OR REPLACE FUNCTION public.get_pnl_aggregates(p_org_id uuid, p_from_date date, p_to_date date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'gross_sales', COALESCE((
      SELECT SUM(COALESCE(gross_amount, net_amount) - COALESCE(sale_return_adjust, 0))
      FROM sales
      WHERE organization_id = p_org_id
        AND sale_date >= p_from_date AND sale_date <= p_to_date
        AND deleted_at IS NULL
        AND is_cancelled = false
        AND net_amount >= 0
    ), 0),
    'sales_returns', COALESCE((
      SELECT SUM(COALESCE(gross_amount, net_amount))
      FROM sale_returns
      WHERE organization_id = p_org_id
        AND return_date >= p_from_date AND return_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'purchases_gross', COALESCE((
      SELECT SUM(COALESCE(gross_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'purchases_gst', COALESCE((
      SELECT SUM(COALESCE(gst_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'purchase_returns', COALESCE((
      SELECT SUM(COALESCE(gross_amount, net_amount))
      FROM purchase_returns
      WHERE organization_id = p_org_id
        AND return_date >= p_from_date AND return_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'total_expenses', COALESCE((
      SELECT SUM(total_amount)
      FROM voucher_entries
      WHERE organization_id = p_org_id
        AND voucher_type = 'expense'
        AND voucher_date >= p_from_date AND voucher_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'input_gst', COALESCE((
      SELECT SUM(COALESCE(gst_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0)
  ) INTO result;

  RETURN result;
END;
$function$;

-- FIX 1+2: Update get_net_profit_aggregates
CREATE OR REPLACE FUNCTION public.get_net_profit_aggregates(p_org_id uuid, p_from_date date, p_to_date date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  SELECT json_build_object(
    'total_sales', COALESCE((
      SELECT SUM(net_amount - COALESCE(sale_return_adjust, 0))
      FROM sales
      WHERE organization_id = p_org_id
        AND sale_date >= p_from_date AND sale_date <= p_to_date
        AND deleted_at IS NULL
        AND is_cancelled = false
        AND net_amount >= 0
    ), 0),
    'sales_returns', COALESCE((
      SELECT SUM(net_amount)
      FROM sale_returns
      WHERE organization_id = p_org_id
        AND return_date >= p_from_date AND return_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'input_gst', COALESCE((
      SELECT SUM(COALESCE(gst_amount, 0))
      FROM purchase_bills
      WHERE organization_id = p_org_id
        AND bill_date >= p_from_date AND bill_date <= p_to_date
        AND deleted_at IS NULL
    ), 0),
    'total_expenses', COALESCE((
      SELECT SUM(total_amount)
      FROM voucher_entries
      WHERE organization_id = p_org_id
        AND voucher_type = 'expense'
        AND voucher_date >= p_from_date AND voucher_date <= p_to_date
        AND deleted_at IS NULL
    ), 0)
  ) INTO result;

  RETURN result;
END;
$function$;

-- FIX 1: Update get_gst_summary - exclude cancelled and negative sales
CREATE OR REPLACE FUNCTION public.get_gst_summary(p_organization_id uuid, p_from_date date, p_to_date date)
 RETURNS TABLE(gst_percent integer, taxable_amount numeric, cgst_amount numeric, sgst_amount numeric, igst_amount numeric, total_amount numeric, invoice_count bigint)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    si.gst_percent,
    SUM(si.line_total / (1 + si.gst_percent::numeric/100)) AS taxable_amount,
    SUM(si.line_total / (1 + si.gst_percent::numeric/100)
        * (si.gst_percent::numeric/200)) AS cgst_amount,
    SUM(si.line_total / (1 + si.gst_percent::numeric/100)
        * (si.gst_percent::numeric/200)) AS sgst_amount,
    0::numeric AS igst_amount,
    SUM(si.line_total) AS total_amount,
    COUNT(DISTINCT si.sale_id) AS invoice_count
  FROM public.sale_items si
  JOIN public.sales s ON s.id = si.sale_id
  WHERE
    s.organization_id = p_organization_id
    AND s.sale_date::date BETWEEN p_from_date AND p_to_date
    AND s.deleted_at IS NULL
    AND si.deleted_at IS NULL
    AND s.is_cancelled = false
    AND s.net_amount >= 0
  GROUP BY si.gst_percent
  ORDER BY si.gst_percent;
$function$;

-- FIX 1+5: Update get_trial_balance_aggregates - exclude cancelled/negative sales and add voucher_receipts to cash_balance
CREATE OR REPLACE FUNCTION public.get_trial_balance_aggregates(p_org_id uuid, p_as_of_date date)
 RETURNS json
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  result JSON;
BEGIN
  WITH sales_agg AS (
    SELECT
      customer_id,
      COALESCE(SUM(net_amount), 0) AS total_net,
      COALESCE(SUM(paid_amount), 0) AS total_paid
    FROM sales
    WHERE organization_id = p_org_id
      AND sale_date <= p_as_of_date
      AND deleted_at IS NULL
      AND is_cancelled = false
      AND net_amount >= 0
    GROUP BY customer_id
  ),
  purchase_agg AS (
    SELECT
      supplier_id,
      COALESCE(SUM(net_amount), 0) AS total_net,
      COALESCE(SUM(paid_amount), 0) AS total_paid
    FROM purchase_bills
    WHERE organization_id = p_org_id
      AND bill_date <= p_as_of_date
      AND deleted_at IS NULL
    GROUP BY supplier_id
  ),
  customer_balances AS (
    SELECT COALESCE(SUM(
      COALESCE(c.opening_balance, 0) + COALESCE(s.total_net, 0) - COALESCE(s.total_paid, 0)
    ), 0) AS total_debtors
    FROM customers c
    LEFT JOIN sales_agg s ON s.customer_id = c.id
    WHERE c.organization_id = p_org_id
      AND c.deleted_at IS NULL
  ),
  supplier_balances AS (
    SELECT COALESCE(SUM(
      COALESCE(sup.opening_balance, 0) + COALESCE(p.total_net, 0) - COALESCE(p.total_paid, 0)
    ), 0) AS total_creditors
    FROM suppliers sup
    LEFT JOIN purchase_agg p ON p.supplier_id = sup.id
    WHERE sup.organization_id = p_org_id
      AND sup.deleted_at IS NULL
  ),
  sale_returns_agg AS (
    SELECT COALESCE(SUM(net_amount), 0) AS total
    FROM sale_returns
    WHERE organization_id = p_org_id
      AND return_date <= p_as_of_date
      AND deleted_at IS NULL
  ),
  purchase_returns_agg AS (
    SELECT COALESCE(SUM(net_amount), 0) AS total
    FROM purchase_returns
    WHERE organization_id = p_org_id
      AND return_date <= p_as_of_date
      AND deleted_at IS NULL
  ),
  sales_totals AS (
    SELECT
      COALESCE(SUM(net_amount), 0) AS total_sales,
      COALESCE(SUM(paid_amount), 0) AS total_sales_paid
    FROM sales
    WHERE organization_id = p_org_id
      AND sale_date <= p_as_of_date
      AND deleted_at IS NULL
      AND is_cancelled = false
      AND net_amount >= 0
  ),
  purchase_totals AS (
    SELECT
      COALESCE(SUM(net_amount), 0) AS total_purchases,
      COALESCE(SUM(paid_amount), 0) AS total_purchases_paid
    FROM purchase_bills
    WHERE organization_id = p_org_id
      AND bill_date <= p_as_of_date
      AND deleted_at IS NULL
  ),
  voucher_receipts AS (
    SELECT
      COALESCE(SUM(CASE WHEN voucher_type = 'receipt' THEN total_amount ELSE 0 END), 0)
        - COALESCE(SUM(CASE WHEN voucher_type = 'payment' THEN total_amount ELSE 0 END), 0)
        AS net_receipts
    FROM voucher_entries
    WHERE organization_id = p_org_id
      AND voucher_date <= p_as_of_date
      AND deleted_at IS NULL
  )
  SELECT json_build_object(
    'total_debtors', (SELECT total_debtors FROM customer_balances),
    'total_creditors', (SELECT total_creditors FROM supplier_balances),
    'total_sales', (SELECT total_sales FROM sales_totals),
    'total_sales_paid', (SELECT total_sales_paid FROM sales_totals),
    'total_purchases', (SELECT total_purchases FROM purchase_totals),
    'total_purchases_paid', (SELECT total_purchases_paid FROM purchase_totals),
    'total_sale_returns', (SELECT total FROM sale_returns_agg),
    'total_purchase_returns', (SELECT total FROM purchase_returns_agg),
    'cash_balance',
      (SELECT total_sales_paid FROM sales_totals)
      - (SELECT total_purchases_paid FROM purchase_totals)
      + (SELECT net_receipts FROM voucher_receipts),
    'accounts_receivable', (SELECT total_debtors FROM customer_balances),
    'accounts_payable', (SELECT total_creditors FROM supplier_balances)
  ) INTO result;

  RETURN result;
END;
$function$;