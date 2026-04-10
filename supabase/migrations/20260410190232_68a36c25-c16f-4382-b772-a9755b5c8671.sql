
-- Drop dependent views
DROP VIEW IF EXISTS v_dashboard_gross_profit;
DROP VIEW IF EXISTS v_dashboard_purchase_summary;
DROP VIEW IF EXISTS v_dashboard_sales_summary;
DROP VIEW IF EXISTS v_dashboard_stock_summary;

-- Drop column-specific trigger on sale_items
DROP TRIGGER IF EXISTS trg_update_sale_total_qty ON sale_items;

-- Now alter all columns
ALTER TABLE product_variants ALTER COLUMN stock_qty TYPE NUMERIC(10,3);
ALTER TABLE product_variants ALTER COLUMN opening_qty TYPE NUMERIC(10,3);
ALTER TABLE purchase_items ALTER COLUMN qty TYPE NUMERIC(10,3);
ALTER TABLE sale_items ALTER COLUMN quantity TYPE NUMERIC(10,3);
ALTER TABLE sale_return_items ALTER COLUMN quantity TYPE NUMERIC(10,3);
ALTER TABLE purchase_return_items ALTER COLUMN qty TYPE NUMERIC(10,3);
ALTER TABLE batch_stock ALTER COLUMN quantity TYPE NUMERIC(10,3);
ALTER TABLE stock_movements ALTER COLUMN quantity TYPE NUMERIC(10,3);

-- Update trigger function to handle numeric qty (remove ::integer cast)
CREATE OR REPLACE FUNCTION public.update_sale_total_qty()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  target_sale_id uuid;
BEGIN
  IF TG_OP = 'DELETE' THEN
    target_sale_id := OLD.sale_id;
  ELSE
    target_sale_id := NEW.sale_id;
  END IF;
  
  UPDATE public.sales SET total_qty = COALESCE((
    SELECT SUM(quantity)::numeric FROM public.sale_items 
    WHERE sale_id = target_sale_id AND deleted_at IS NULL
  ), 0) WHERE id = target_sale_id;
  
  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Recreate the trigger
CREATE TRIGGER trg_update_sale_total_qty
AFTER INSERT OR DELETE OR UPDATE OF quantity, deleted_at, sale_id
ON public.sale_items
FOR EACH ROW
EXECUTE FUNCTION update_sale_total_qty();

-- Recreate views
CREATE OR REPLACE VIEW v_dashboard_stock_summary AS
SELECT pv.organization_id,
    COALESCE(sum(pv.stock_qty), 0) AS total_stock_qty,
    COALESCE(sum(pv.stock_qty * COALESCE(pv.pur_price, 0)), 0) AS total_stock_value,
    COALESCE(sum(pv.stock_qty * COALESCE(pv.sale_price, 0)), 0) AS total_sale_value,
    count(*)::integer AS total_variant_count
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL AND pv.active = true AND p.product_type <> 'service'
GROUP BY pv.organization_id;

CREATE OR REPLACE VIEW v_dashboard_sales_summary AS
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
GROUP BY s.organization_id, (date(s.sale_date));

CREATE OR REPLACE VIEW v_dashboard_purchase_summary AS
SELECT p.organization_id,
    p.bill_date AS purchase_day,
    count(DISTINCT p.id) AS bill_count,
    COALESCE(sum(DISTINCT p.net_amount), 0::numeric) AS total_purchase_amount,
    COALESCE(sum(DISTINCT p.paid_amount), 0::numeric) AS total_paid_amount,
    COALESCE(sum(DISTINCT p.net_amount) - sum(DISTINCT p.paid_amount), 0::numeric) AS total_pending_amount,
    COALESCE(sum(pi.qty), 0::numeric) AS total_items_purchased
FROM purchase_bills p
LEFT JOIN purchase_items pi ON pi.bill_id = p.id AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.organization_id, p.bill_date;

CREATE OR REPLACE VIEW v_dashboard_gross_profit AS
SELECT s.organization_id,
    date(s.sale_date) AS sale_day,
    COALESCE(sum(s.net_amount), 0::numeric) AS total_sale_amount,
    COALESCE(sum(sub.cost_amount), 0::numeric) AS total_cost_amount,
    COALESCE(sum(s.net_amount), 0::numeric) - COALESCE(sum(sub.cost_amount), 0::numeric) AS gross_profit,
    CASE
        WHEN sum(s.net_amount) = 0::numeric THEN 0::numeric
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
GROUP BY s.organization_id, (date(s.sale_date));
