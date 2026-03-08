
CREATE OR REPLACE FUNCTION public.get_accounts_dashboard_metrics(
  p_org_id UUID, p_month_start DATE, p_month_end DATE
)
RETURNS JSON LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path = public AS $$
BEGIN
  RETURN json_build_object(
    'totalReceivables',  (SELECT COALESCE(SUM(net_amount - paid_amount), 0)
                          FROM sales WHERE organization_id = p_org_id
                          AND deleted_at IS NULL AND payment_status != 'completed'),
    'totalPayables',     (SELECT COALESCE(SUM(net_amount - paid_amount), 0)
                          FROM purchase_bills WHERE organization_id = p_org_id
                          AND deleted_at IS NULL AND payment_status != 'paid'),
    'monthlyExpenses',   (SELECT COALESCE(SUM(amount), 0)
                          FROM voucher_entries WHERE organization_id = p_org_id
                          AND entry_date BETWEEN p_month_start AND p_month_end),
    'invoiceStats',      (SELECT json_build_object(
                            'total', COUNT(*),
                            'paid', COUNT(*) FILTER (WHERE payment_status = 'completed'),
                            'partial', COUNT(*) FILTER (WHERE payment_status = 'partial'),
                            'pending', COUNT(*) FILTER (WHERE payment_status = 'pending')
                          ) FROM sales
                          WHERE organization_id = p_org_id AND deleted_at IS NULL)
  );
END; $$;
