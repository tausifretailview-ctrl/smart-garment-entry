-- Sale Bill -> "Sale Order No.": link a sale bill made by hand to a booked sale order.
--
-- A shop that does not convert an order (some items not available) makes a new sale bill and
-- picks the order in the bill's "Sale Order No." box. On save the order becomes status
-- 'invoiced' (green "Invoiced" on the Sale Order dashboard and in the Field Sales app). These
-- columns keep which bill covered it. status is free text (no CHECK), so 'invoiced' needs no
-- change; open-order reports already count only 'pending' and 'partial'.
--
-- Only adds nullable columns and an index: no data is changed. Safe to run more than once.
-- UNDO: ALTER TABLE public.sale_orders DROP COLUMN invoiced_sale_id, DROP COLUMN invoiced_sale_number,
--       DROP COLUMN invoiced_at;

ALTER TABLE public.sale_orders
  ADD COLUMN IF NOT EXISTS invoiced_sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  ADD COLUMN IF NOT EXISTS invoiced_sale_number text,
  ADD COLUMN IF NOT EXISTS invoiced_at timestamptz;

CREATE INDEX IF NOT EXISTS idx_sale_orders_invoiced_sale_id
  ON public.sale_orders (invoiced_sale_id)
  WHERE invoiced_sale_id IS NOT NULL;

COMMENT ON COLUMN public.sale_orders.invoiced_sale_id IS
  'Sale bill made by hand for this order (Sale Bill -> Sale Order No.); status is then invoiced.';

-- Check (read-only): should list the three columns.
-- SELECT column_name FROM information_schema.columns
--  WHERE table_schema = 'public' AND table_name = 'sale_orders' AND column_name LIKE 'invoiced%';
