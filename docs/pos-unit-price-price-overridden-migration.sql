-- POS unit price override — sale_items.price_overridden
-- Status: PRESENT FOR APPROVAL — do NOT apply until reviewed.
-- Purpose: distinguish cashier-typed unit price from master sale_price < MRP
--          (inferring from unit_price alone false-positives after master repricing).
--
-- After apply:
-- 1. useSaveSale inserts should set price_overridden = true when cart rateAuthority === 'unit'
-- 2. POS edit-resume should set rateAuthority = 'unit' when price_overridden is true

ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS price_overridden boolean NOT NULL DEFAULT false;

COMMENT ON COLUMN public.sale_items.price_overridden IS
  'True when POS cashier typed Unit Price (rateAuthority=unit) on this line at save.';

-- Optional index for Price History “Rate override” filter (skip if not needed yet):
-- CREATE INDEX IF NOT EXISTS sale_items_price_overridden_idx
--   ON public.sale_items (organization_id)
--   WHERE price_overridden = true AND deleted_at IS NULL;
