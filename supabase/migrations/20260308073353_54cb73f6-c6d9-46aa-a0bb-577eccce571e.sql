-- Drop all dependent views
DROP VIEW IF EXISTS public.v_dashboard_gross_profit;
DROP VIEW IF EXISTS public.v_dashboard_purchase_summary;
DROP VIEW IF EXISTS public.v_dashboard_stock_summary;

-- product_variants
ALTER TABLE public.product_variants
  ALTER COLUMN pur_price TYPE NUMERIC(15,2),
  ALTER COLUMN sale_price TYPE NUMERIC(15,2),
  ALTER COLUMN mrp TYPE NUMERIC(15,2);

-- purchase_items
ALTER TABLE public.purchase_items
  ALTER COLUMN pur_price TYPE NUMERIC(15,2),
  ALTER COLUMN sale_price TYPE NUMERIC(15,2),
  ALTER COLUMN mrp TYPE NUMERIC(15,2),
  ALTER COLUMN line_total TYPE NUMERIC(15,2);

-- purchase_bills
ALTER TABLE public.purchase_bills
  ALTER COLUMN gross_amount TYPE NUMERIC(15,2),
  ALTER COLUMN net_amount TYPE NUMERIC(15,2),
  ALTER COLUMN gst_amount TYPE NUMERIC(15,2),
  ALTER COLUMN discount_amount TYPE NUMERIC(15,2),
  ALTER COLUMN paid_amount TYPE NUMERIC(15,2),
  ALTER COLUMN round_off TYPE NUMERIC(15,2),
  ALTER COLUMN other_charges TYPE NUMERIC(15,2);

-- Recreate views with security_invoker
CREATE OR REPLACE VIEW public.v_dashboard_stock_summary
WITH (security_invoker = true) AS
SELECT pv.organization_id,
    COALESCE(sum(pv.stock_qty), 0::bigint) AS total_stock_qty,
    COALESCE(sum(pv.stock_qty::numeric * pv.pur_price), 0::numeric) AS total_stock_value
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE pv.deleted_at IS NULL AND p.deleted_at IS NULL
GROUP BY pv.organization_id;

CREATE OR REPLACE VIEW public.v_dashboard_gross_profit
WITH (security_invoker = true) AS
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
    SELECT COALESCE(sum(si.quantity::numeric * COALESCE(pv.pur_price, 0::numeric)), 0::numeric) AS cost_amount
    FROM sale_items si
    LEFT JOIN product_variants pv ON pv.id = si.variant_id
    WHERE si.sale_id = s.id AND si.deleted_at IS NULL
) sub ON true
WHERE s.deleted_at IS NULL
GROUP BY s.organization_id, date(s.sale_date);

CREATE OR REPLACE VIEW public.v_dashboard_purchase_summary
WITH (security_invoker = true) AS
SELECT p.organization_id,
    p.bill_date AS purchase_day,
    count(DISTINCT p.id) AS bill_count,
    COALESCE(sum(DISTINCT p.net_amount), 0::numeric) AS total_purchase_amount,
    COALESCE(sum(DISTINCT p.paid_amount), 0::numeric) AS total_paid_amount,
    COALESCE(sum(DISTINCT p.net_amount) - sum(DISTINCT p.paid_amount), 0::numeric) AS total_pending_amount,
    COALESCE(sum(pi.qty), 0::bigint) AS total_items_purchased
FROM purchase_bills p
LEFT JOIN purchase_items pi ON pi.bill_id = p.id AND pi.deleted_at IS NULL
WHERE p.deleted_at IS NULL
GROUP BY p.organization_id, p.bill_date;