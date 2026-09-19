-- Form-only MRP→Sale disc % typed at Product Entry (Sale Disc %).
-- Distinct from products.sale_discount_type / sale_discount_value, which drive
-- live POS catalogue discount when product_entry_discount_enabled is on.

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS pricing_sale_disc_percent numeric;

COMMENT ON COLUMN public.products.pricing_sale_disc_percent IS
  'MRP pricing Sale Disc % from Product Entry. Null/0 means not entered. Not POS sale_discount_value.';
