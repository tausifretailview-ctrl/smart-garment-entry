-- Strengthen P&L: sales_returns only counts credit_note/exchange
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
        AND refund_type IN ('credit_note', 'exchange')
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

-- Strengthen Net Profit: sales_returns only counts credit_note/exchange
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
        AND refund_type IN ('credit_note', 'exchange')
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

-- Strengthen Trial Balance: deduct sale_return_adjust in sales_agg/sales_totals; sale_returns_agg only credit_note/exchange
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
      COALESCE(SUM(net_amount - COALESCE(sale_return_adjust, 0)), 0) AS total_net,
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
      AND refund_type IN ('credit_note', 'exchange')
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
      COALESCE(SUM(net_amount - COALESCE(sale_return_adjust, 0)), 0) AS total_sales,
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
  voucher_net AS (
    SELECT
      COALESCE(SUM(CASE WHEN voucher_type = 'receipt' THEN total_amount ELSE 0 END), 0)
      - COALESCE(SUM(CASE WHEN voucher_type = 'payment' THEN total_amount ELSE 0 END), 0)
      AS net_vouchers
    FROM voucher_entries
    WHERE organization_id = p_org_id
      AND voucher_date <= p_as_of_date
      AND deleted_at IS NULL
      AND voucher_type IN ('receipt', 'payment')
  )
  SELECT json_build_object(
    'total_debtors',         (SELECT total_debtors FROM customer_balances),
    'total_creditors',       (SELECT total_creditors FROM supplier_balances),
    'total_sales',           (SELECT total_sales FROM sales_totals),
    'total_sales_paid',      (SELECT total_sales_paid FROM sales_totals),
    'total_purchases',       (SELECT total_purchases FROM purchase_totals),
    'total_purchases_paid',  (SELECT total_purchases_paid FROM purchase_totals),
    'total_sale_returns',    (SELECT total FROM sale_returns_agg),
    'total_purchase_returns',(SELECT total FROM purchase_returns_agg),
    'cash_balance',
      (SELECT total_sales_paid FROM sales_totals)
      - (SELECT total_purchases_paid FROM purchase_totals)
      + (SELECT net_vouchers FROM voucher_net),
    'accounts_receivable', (SELECT total_debtors FROM customer_balances),
    'accounts_payable',    (SELECT total_creditors FROM supplier_balances)
  ) INTO result;
  RETURN result;
END;
$function$;

-- Add is_cancelled filter to Sales Invoice Dashboard stats
CREATE OR REPLACE FUNCTION public.get_sales_invoice_dashboard_stats(p_org_id uuid, p_search text DEFAULT NULL::text, p_date_start text DEFAULT NULL::text, p_date_end text DEFAULT NULL::text, p_payment_status text DEFAULT NULL::text, p_delivery_status text DEFAULT NULL::text)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_total_invoices integer;
  v_total_amount numeric;
  v_total_discount numeric;
  v_total_qty integer;
  v_pending_amount numeric;
  v_delivered_count integer;
  v_delivered_amount numeric;
  v_undelivered_count integer;
  v_undelivered_amount numeric;
BEGIN
  SELECT 
    COUNT(*)::integer,
    COALESCE(SUM(net_amount), 0)::numeric,
    COALESCE(SUM(COALESCE(discount_amount, 0) + COALESCE(flat_discount_amount, 0)), 0)::numeric,
    COALESCE(SUM(COALESCE(total_qty, 0)), 0)::integer,
    COALESCE(SUM(CASE WHEN payment_status != 'completed' THEN net_amount - COALESCE(paid_amount, 0) ELSE 0 END), 0)::numeric,
    COUNT(*) FILTER (WHERE delivery_status = 'delivered')::integer,
    COALESCE(SUM(net_amount) FILTER (WHERE delivery_status = 'delivered'), 0)::numeric,
    COUNT(*) FILTER (WHERE COALESCE(delivery_status, 'undelivered') != 'delivered')::integer,
    COALESCE(SUM(net_amount) FILTER (WHERE COALESCE(delivery_status, 'undelivered') != 'delivered'), 0)::numeric
  INTO v_total_invoices, v_total_amount, v_total_discount, v_total_qty, v_pending_amount,
       v_delivered_count, v_delivered_amount, v_undelivered_count, v_undelivered_amount
  FROM sales
  WHERE organization_id = p_org_id
    AND sale_type = 'invoice'
    AND deleted_at IS NULL
    AND is_cancelled = false
    AND (p_search IS NULL OR p_search = '' OR sale_number ILIKE '%' || p_search || '%' OR customer_name ILIKE '%' || p_search || '%' OR customer_phone ILIKE '%' || p_search || '%')
    AND (p_date_start IS NULL OR p_date_start = '' OR sale_date >= p_date_start::date)
    AND (p_date_end IS NULL OR p_date_end = '' OR sale_date <= p_date_end::date)
    AND (p_payment_status IS NULL OR p_payment_status = '' OR p_payment_status = 'all' OR payment_status = p_payment_status)
    AND (p_delivery_status IS NULL OR p_delivery_status = '' OR p_delivery_status = 'all' OR COALESCE(delivery_status, 'undelivered') = p_delivery_status);

  RETURN json_build_object(
    'totalInvoices', v_total_invoices,
    'totalAmount', v_total_amount,
    'totalDiscount', v_total_discount,
    'totalQty', v_total_qty,
    'pendingAmount', v_pending_amount,
    'deliveredCount', v_delivered_count,
    'deliveredAmount', v_delivered_amount,
    'undeliveredCount', v_undelivered_count,
    'undeliveredAmount', v_undelivered_amount
  );
END;
$function$;