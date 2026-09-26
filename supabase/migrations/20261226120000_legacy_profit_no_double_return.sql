-- Legacy P&L / Net Profit: a sale return was deducted twice on exchange bills.
-- sales_returns already subtracts the return; sales must not also subtract
-- sale_return_adjust (that is the return credit used to PAY the new bill, not a sales reduction).

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
      SELECT SUM(COALESCE(gross_amount, net_amount))
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
      SELECT SUM(net_amount)
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
