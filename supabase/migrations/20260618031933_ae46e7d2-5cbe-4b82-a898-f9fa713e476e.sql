CREATE OR REPLACE FUNCTION public.get_accounts_dashboard_metrics(p_org_id uuid, p_month_start date, p_month_end date)
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_receivables numeric := 0;
  v_payables    numeric := 0;
BEGIN
  -- True net customer receivables (matches Customer Reconciliation page).
  SELECT COALESCE(net_receivable, 0) INTO v_receivables
  FROM public.get_organization_receivables_summary(p_org_id);

  -- True net supplier payables (open bills − inline paid − voucher payments − credit notes).
  SELECT COALESCE(net_outstanding, 0) INTO v_payables
  FROM public.get_organization_supplier_payable_summary(p_org_id);

  RETURN json_build_object(
    'totalReceivables',  v_receivables,
    'totalPayables',     v_payables,
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
                            'total',         COUNT(*),
                            'totalAmount',   COALESCE(SUM(net_amount), 0),
                            'paid',          COUNT(*) FILTER (WHERE payment_status = 'completed'),
                            -- actual money collected on completed invoices (not invoice total)
                            'paidAmount',    COALESCE(SUM(COALESCE(paid_amount,0)) FILTER (WHERE payment_status = 'completed'), 0),
                            'partial',       COUNT(*) FILTER (WHERE payment_status = 'partial'),
                            -- balance still due on partial invoices (not invoice total)
                            'partialAmount', COALESCE(SUM(GREATEST(net_amount - COALESCE(paid_amount,0), 0)) FILTER (WHERE payment_status = 'partial'), 0),
                            'pending',       COUNT(*) FILTER (WHERE payment_status = 'pending'),
                            'pendingAmount', COALESCE(SUM(GREATEST(net_amount - COALESCE(paid_amount,0), 0)) FILTER (WHERE payment_status = 'pending'), 0)
                          ) FROM sales
                          WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND COALESCE(is_cancelled, false) = false
                          AND payment_status NOT IN ('cancelled','hold'))
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.get_accounts_dashboard_metrics(uuid, date, date) TO authenticated, service_role;