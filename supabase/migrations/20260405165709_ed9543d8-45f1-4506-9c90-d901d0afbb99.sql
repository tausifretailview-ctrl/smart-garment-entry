
CREATE OR REPLACE FUNCTION public.get_accounts_dashboard_metrics(
  p_org_id UUID,
  p_month_start DATE,
  p_month_end DATE
)
RETURNS JSON
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN json_build_object(
    'totalReceivables',  (SELECT COALESCE(SUM(net_amount - paid_amount), 0)
                          FROM sales WHERE organization_id = p_org_id
                          AND deleted_at IS NULL AND payment_status NOT IN ('completed','cancelled','hold')),
    'totalPayables',     (SELECT COALESCE(SUM(net_amount - paid_amount), 0)
                          FROM purchase_bills WHERE organization_id = p_org_id
                          AND deleted_at IS NULL AND payment_status != 'paid'),
    'monthlyExpenses',   (SELECT COALESCE(SUM(total_amount), 0)
                          FROM voucher_entries WHERE organization_id = p_org_id
                          AND voucher_type = 'expense'
                          AND deleted_at IS NULL
                          AND voucher_date BETWEEN p_month_start AND p_month_end),
    'monthlySales',      (SELECT COALESCE(SUM(net_amount), 0)
                          FROM sales WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
                          AND payment_status NOT IN ('cancelled','hold')
                          AND sale_date BETWEEN p_month_start AND p_month_end),
    'monthlyPurchases',  (SELECT COALESCE(SUM(net_amount), 0)
                          FROM purchase_bills WHERE organization_id = p_org_id
                          AND deleted_at IS NULL
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
                          AND payment_status NOT IN ('cancelled','hold'))
  );
END;
$$;
