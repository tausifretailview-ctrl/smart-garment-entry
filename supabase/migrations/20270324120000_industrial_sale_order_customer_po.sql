-- Industrial mode, Phase 1 step 6: customer PO number and date on sale orders.
-- Nullable columns, no defaults: existing orders and retail shops are unchanged.
-- Written only when Industrial mode is on; copied into the bill's Order & dispatch details.

ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS customer_po_no text;
ALTER TABLE public.sale_orders ADD COLUMN IF NOT EXISTS customer_po_date date;

COMMENT ON COLUMN public.sale_orders.customer_po_no IS 'Industrial mode: buyer''s purchase order number';
COMMENT ON COLUMN public.sale_orders.customer_po_date IS 'Industrial mode: buyer''s purchase order date';
