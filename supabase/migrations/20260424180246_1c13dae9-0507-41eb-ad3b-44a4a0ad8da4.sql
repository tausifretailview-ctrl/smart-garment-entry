-- ============================================================================
-- Exclude cancelled sales from all dashboards, summary views, and report RPCs
-- ============================================================================

-- 1) Sales summary view (used by main dashboard cards + 7-day chart)
CREATE OR REPLACE VIEW public.v_dashboard_sales_summary AS
SELECT s.organization_id,
       date(s.sale_date) AS sale_day,
       count(DISTINCT s.id) AS invoice_count,
       COALESCE(sum(DISTINCT s.net_amount), 0::numeric) AS total_sales,
       COALESCE(sum(DISTINCT s.paid_amount), 0::numeric) AS total_paid,
       COALESCE(sum(DISTINCT s.cash_amount), 0::numeric) AS total_cash,
       COALESCE(sum(si.quantity), 0::numeric) AS sold_qty
FROM sales s
LEFT JOIN sale_items si ON si.sale_id = s.id AND si.deleted_at IS NULL
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
GROUP BY s.organization_id, date(s.sale_date);

-- 2) Gross profit view
CREATE OR REPLACE VIEW public.v_dashboard_gross_profit AS
SELECT s.organization_id,
       date(s.sale_date) AS sale_day,
       COALESCE(sum(s.net_amount), 0::numeric) AS total_sale_amount,
       COALESCE(sum(sub.cost_amount), 0::numeric) AS total_cost_amount,
       COALESCE(sum(s.net_amount), 0::numeric) - COALESCE(sum(sub.cost_amount), 0::numeric) AS gross_profit,
       CASE WHEN sum(s.net_amount) = 0::numeric THEN 0::numeric
            ELSE (sum(s.net_amount) - COALESCE(sum(sub.cost_amount), 0::numeric)) / sum(s.net_amount) * 100::numeric
       END AS gross_margin_percent
FROM sales s
LEFT JOIN LATERAL (
  SELECT COALESCE(sum(si.quantity * COALESCE(pv.pur_price, 0::numeric)), 0::numeric) AS cost_amount
  FROM sale_items si
  LEFT JOIN product_variants pv ON pv.id = si.variant_id
  WHERE si.sale_id = s.id AND si.deleted_at IS NULL
) sub ON true
WHERE s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
GROUP BY s.organization_id, date(s.sale_date);

-- 3) Receivables view
CREATE OR REPLACE VIEW public.v_dashboard_receivables AS
SELECT organization_id,
       count(*) AS pending_count,
       COALESCE(sum(GREATEST(COALESCE(net_amount, 0::numeric) - COALESCE(paid_amount, 0::numeric), 0::numeric)), 0::numeric) AS total_receivables
FROM sales
WHERE deleted_at IS NULL
  AND COALESCE(is_cancelled, false) = false
  AND payment_status = ANY (ARRAY['pending'::text, 'partial'::text])
GROUP BY organization_id;

-- 4) Accounts dashboard metrics RPC
CREATE OR REPLACE FUNCTION public.get_accounts_dashboard_metrics(p_org_id uuid, p_month_start date, p_month_end date)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  RETURN json_build_object(
    'totalReceivables',  (SELECT COALESCE(SUM(net_amount - paid_amount), 0)
                          FROM sales WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND COALESCE(is_cancelled, false) = false
                          AND payment_status NOT IN ('completed','cancelled','hold')),
    'totalPayables',     (SELECT COALESCE(SUM(net_amount - paid_amount), 0)
                          FROM purchase_bills WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND COALESCE(is_cancelled, false) = false
                          AND payment_status != 'paid'),
    'monthlyExpenses',   (SELECT COALESCE(SUM(total_amount), 0)
                          FROM voucher_entries WHERE organization_id = p_org_id
                          AND voucher_type = 'expense'
                          AND deleted_at IS NULL
                          AND voucher_date BETWEEN p_month_start AND p_month_end),
    'monthlySales',      (SELECT COALESCE(SUM(net_amount), 0)
                          FROM sales WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND COALESCE(is_cancelled, false) = false
                          AND payment_status NOT IN ('cancelled','hold')
                          AND sale_date BETWEEN p_month_start AND p_month_end),
    'monthlyPurchases',  (SELECT COALESCE(SUM(net_amount), 0)
                          FROM purchase_bills WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND COALESCE(is_cancelled, false) = false
                          AND bill_date BETWEEN p_month_start AND p_month_end),
    'invoiceStats',      (SELECT json_build_object(
                            'total', COUNT(*),
                            'totalAmount', COALESCE(SUM(net_amount), 0),
                            'paid', COUNT(*) FILTER (WHERE payment_status = 'completed'),
                            'paidAmount', COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'completed'), 0),
                            'partial', COUNT(*) FILTER (WHERE payment_status = 'partial'),
                            'partialAmount', COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'partial'), 0),
                            'pending', COUNT(*) FILTER (WHERE payment_status = 'pending'),
                            'pendingAmount', COALESCE(SUM(net_amount) FILTER (WHERE payment_status = 'pending'), 0)
                          ) FROM sales
                          WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND COALESCE(is_cancelled, false) = false
                          AND payment_status NOT IN ('cancelled','hold'))
  );
END;
$function$;

-- 5) Accounts dashboard stats RPC: patch the sales-derived sections
CREATE OR REPLACE FUNCTION public.get_accounts_dashboard_stats(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  result json;
  v_total_receivables numeric;
  v_total_payables numeric;
  v_monthly_expenses numeric;
  v_month_revenue numeric;
  v_month_expenses numeric;
  v_total_invoices bigint;
  v_total_invoice_amount numeric;
  v_paid_amount numeric;
  v_pending_count bigint;
  v_pending_amount numeric;
  v_partial_count bigint;
  v_partial_amount numeric;
  v_completed_count bigint;
  v_completed_amount numeric;
BEGIN
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_receivables
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND reference_type IN ('customer', 'customer_payment', 'SALE')
    AND voucher_type IN ('receipt', 'RECEIPT');

  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_payables
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND reference_type IN ('supplier', 'employee')
    AND voucher_type = 'payment';

  SELECT COALESCE(SUM(total_amount), 0) INTO v_monthly_expenses
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND reference_type = 'expense'
    AND voucher_date >= date_trunc('month', CURRENT_DATE)
    AND voucher_date <= (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day');

  SELECT COALESCE(SUM(net_amount), 0) INTO v_month_revenue
  FROM sales
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false
    AND sale_date >= date_trunc('month', CURRENT_DATE)::date
    AND sale_date <= CURRENT_DATE;

  SELECT COALESCE(SUM(total_amount), 0) INTO v_month_expenses
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND voucher_type = 'payment'
    AND voucher_date >= date_trunc('month', CURRENT_DATE)
    AND voucher_date <= (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day');

  SELECT COUNT(*),
         COALESCE(SUM(net_amount), 0),
         COALESCE(SUM(paid_amount), 0)
  INTO v_total_invoices, v_total_invoice_amount, v_paid_amount
  FROM sales
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false;

  SELECT COUNT(*), COALESCE(SUM(net_amount - paid_amount), 0)
  INTO v_pending_count, v_pending_amount
  FROM sales
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false
    AND payment_status = 'pending';

  SELECT COUNT(*), COALESCE(SUM(net_amount - paid_amount), 0)
  INTO v_partial_count, v_partial_amount
  FROM sales
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false
    AND payment_status = 'partial';

  SELECT COUNT(*), COALESCE(SUM(net_amount), 0)
  INTO v_completed_count, v_completed_amount
  FROM sales
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND COALESCE(is_cancelled, false) = false
    AND payment_status = 'completed';

  result := json_build_object(
    'totalReceivables', v_total_receivables,
    'totalPayables', v_total_payables,
    'monthlyExpenses', v_monthly_expenses,
    'monthRevenue', v_month_revenue,
    'monthExpenses', v_month_expenses,
    'invoiceStats', json_build_object(
      'total', v_total_invoices,
      'totalAmount', v_total_invoice_amount,
      'paidAmount', v_paid_amount,
      'pendingCount', v_pending_count,
      'pendingAmount', v_pending_amount,
      'partialCount', v_partial_count,
      'partialAmount', v_partial_amount,
      'completedCount', v_completed_count,
      'completedAmount', v_completed_amount
    )
  );

  RETURN result;
END;
$function$;

-- 6) Item-wise sales summary RPC
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname='get_item_sales_summary' AND pronamespace='public'::regnamespace LIMIT 1;
  -- inject is_cancelled filter alongside deleted_at on sales
  v_def := replace(v_def, 's.deleted_at IS NULL', 's.deleted_at IS NULL AND COALESCE(s.is_cancelled, false) = false');
  EXECUTE v_def;
END $do$;

-- 7) Sales report summary RPC
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname='get_sales_report_summary' AND pronamespace='public'::regnamespace LIMIT 1;
  v_def := replace(v_def, 'AND deleted_at IS NULL', 'AND deleted_at IS NULL AND COALESCE(is_cancelled, false) = false');
  EXECUTE v_def;
END $do$;

-- 8) Sales summary RPC
DO $do$
DECLARE
  v_def text;
BEGIN
  SELECT pg_get_functiondef(oid) INTO v_def
  FROM pg_proc WHERE proname='get_sales_summary' AND pronamespace='public'::regnamespace LIMIT 1;
  v_def := replace(v_def, 'AND deleted_at IS NULL', 'AND deleted_at IS NULL AND COALESCE(is_cancelled, false) = false');
  EXECUTE v_def;
END $do$;