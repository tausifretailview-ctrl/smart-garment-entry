CREATE OR REPLACE FUNCTION public.get_sales_invoice_dashboard_stats(
  p_org_id uuid,
  p_search text DEFAULT NULL,
  p_date_start text DEFAULT NULL,
  p_date_end text DEFAULT NULL,
  p_payment_status text DEFAULT NULL,
  p_delivery_status text DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
$$;