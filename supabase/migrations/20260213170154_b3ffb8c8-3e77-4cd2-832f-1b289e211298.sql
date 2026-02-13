
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS discount_share numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS net_after_discount numeric NOT NULL DEFAULT 0,
  ADD COLUMN IF NOT EXISTS per_qty_net_amount numeric NOT NULL DEFAULT 0;
