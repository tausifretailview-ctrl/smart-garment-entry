
-- Add total_qty column to sales for fast access without joining sale_items
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS total_qty integer DEFAULT 0;

-- Backfill existing data
UPDATE public.sales s SET total_qty = COALESCE((
  SELECT SUM(si.quantity)::integer FROM public.sale_items si 
  WHERE si.sale_id = s.id AND si.deleted_at IS NULL
), 0);

-- Auto-update trigger when sale_items change
CREATE OR REPLACE FUNCTION public.update_sale_total_qty()
RETURNS TRIGGER AS $$
DECLARE
  target_sale_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_sale_id := OLD.sale_id;
  ELSE
    target_sale_id := NEW.sale_id;
  END IF;
  
  UPDATE public.sales SET total_qty = COALESCE((
    SELECT SUM(quantity)::integer FROM public.sale_items 
    WHERE sale_id = target_sale_id AND deleted_at IS NULL
  ), 0) WHERE id = target_sale_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_update_sale_total_qty ON public.sale_items;
CREATE TRIGGER trg_update_sale_total_qty
AFTER INSERT OR UPDATE OF quantity, deleted_at, sale_id OR DELETE ON public.sale_items
FOR EACH ROW EXECUTE FUNCTION public.update_sale_total_qty();

-- Dashboard stats RPC - computes summary on server instead of downloading all rows
CREATE OR REPLACE FUNCTION public.get_sales_invoice_dashboard_stats(
  p_org_id uuid,
  p_search text DEFAULT '',
  p_date_start text DEFAULT NULL,
  p_date_end text DEFAULT NULL,
  p_payment_status text DEFAULT 'all',
  p_delivery_status text DEFAULT 'all'
)
RETURNS json
LANGUAGE plpgsql STABLE SECURITY DEFINER
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
    AND (p_date_start IS NULL OR sale_date >= p_date_start::date)
    AND (p_date_end IS NULL OR sale_date <= p_date_end::date)
    AND (p_payment_status = 'all' OR payment_status = p_payment_status)
    AND (p_delivery_status = 'all' OR COALESCE(delivery_status, 'undelivered') = p_delivery_status);

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
