
-- RPC for accounts dashboard stats to avoid fetching all customers/sales/suppliers
CREATE OR REPLACE FUNCTION get_accounts_dashboard_stats(p_org_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  -- Receivables from vouchers
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_receivables
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND reference_type IN ('customer', 'customer_payment', 'SALE')
    AND voucher_type IN ('receipt', 'RECEIPT');

  -- Payables from vouchers
  SELECT COALESCE(SUM(total_amount), 0) INTO v_total_payables
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND reference_type IN ('supplier', 'employee')
    AND voucher_type = 'payment';

  -- Monthly expenses
  SELECT COALESCE(SUM(total_amount), 0) INTO v_monthly_expenses
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND reference_type = 'expense'
    AND voucher_date >= date_trunc('month', CURRENT_DATE)
    AND voucher_date <= (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day');

  -- Month revenue from sales
  SELECT COALESCE(SUM(net_amount), 0) INTO v_month_revenue
  FROM sales
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND sale_date >= date_trunc('month', CURRENT_DATE)::date
    AND sale_date <= CURRENT_DATE;

  -- Month payment expenses
  SELECT COALESCE(SUM(total_amount), 0) INTO v_month_expenses
  FROM voucher_entries
  WHERE organization_id = p_org_id
    AND deleted_at IS NULL
    AND voucher_type = 'payment'
    AND voucher_date >= date_trunc('month', CURRENT_DATE)
    AND voucher_date <= (date_trunc('month', CURRENT_DATE) + interval '1 month' - interval '1 day');

  -- Sales payment stats
  SELECT 
    COUNT(*),
    COALESCE(SUM(net_amount), 0),
    COALESCE(SUM(paid_amount), 0)
  INTO v_total_invoices, v_total_invoice_amount, v_paid_amount
  FROM sales
  WHERE organization_id = p_org_id AND deleted_at IS NULL;

  SELECT COUNT(*), COALESCE(SUM(net_amount - COALESCE(paid_amount, 0)), 0)
  INTO v_pending_count, v_pending_amount
  FROM sales
  WHERE organization_id = p_org_id AND deleted_at IS NULL AND payment_status = 'pending';

  SELECT COUNT(*), COALESCE(SUM(net_amount - COALESCE(paid_amount, 0)), 0)
  INTO v_partial_count, v_partial_amount
  FROM sales
  WHERE organization_id = p_org_id AND deleted_at IS NULL AND payment_status = 'partial';

  SELECT COUNT(*), COALESCE(SUM(COALESCE(paid_amount, 0)), 0)
  INTO v_completed_count, v_completed_amount
  FROM sales
  WHERE organization_id = p_org_id AND deleted_at IS NULL AND payment_status = 'completed';

  result := json_build_object(
    'totalReceivables', v_total_receivables,
    'totalPayables', v_total_payables,
    'monthlyExpenses', v_monthly_expenses,
    'currentMonthPL', v_month_revenue - v_month_expenses,
    'totalInvoices', v_total_invoices,
    'totalAmount', v_total_invoice_amount,
    'paidAmount', v_paid_amount,
    'pendingCount', v_pending_count,
    'pendingAmount', v_pending_amount,
    'partialCount', v_partial_count,
    'partialAmount', v_partial_amount,
    'completedCount', v_completed_count,
    'completedAmount', v_completed_amount
  );

  RETURN result;
END;
$$;
