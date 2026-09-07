-- Allow purchase line sku_id remaps to write stock_movements.
-- handle_purchase_item_update (since 20260423) inserts:
--   purchase_sku_change_out  (quantity = -OLD.qty)
--   purchase_sku_change_in   (quantity = NEW.qty)
-- The check constraint was never widened, so editing a purchase line's variant
-- (price-tier fork, size/barcode remap) fails:
--   Error in purchase_item_update trigger: ... stock_movements_movement_type_check
-- KS Footwear hit this after a draft retry (sku_id changed on UPDATE).
--
-- stock_qty is already adjusted in handle_purchase_item_update before the
-- movement insert. current_stock (legacy) gets the signed quantity here.

ALTER TABLE public.stock_movements
  DROP CONSTRAINT IF EXISTS stock_movements_movement_type_check;

ALTER TABLE public.stock_movements
  ADD CONSTRAINT stock_movements_movement_type_check
  CHECK (movement_type = ANY (ARRAY[
    'purchase'::text,
    'sale'::text,
    'purchase_return'::text,
    'sale_return'::text,
    'purchase_delete'::text,
    'purchase_increase'::text,
    'purchase_decrease'::text,
    'sale_delete'::text,
    'sale_return_delete'::text,
    'purchase_return_delete'::text,
    'reconciliation'::text,
    'soft_delete_purchase'::text,
    'restore_purchase'::text,
    'soft_delete_sale'::text,
    'restore_sale'::text,
    'soft_delete_sale_return'::text,
    'restore_sale_return'::text,
    'soft_delete_purchase_return'::text,
    'restore_purchase_return'::text,
    'stock_reset'::text,
    'sale_update_decrease'::text,
    'sale_update_increase'::text,
    'purchase_edit'::text,
    'purchase_sku_change_out'::text,
    'purchase_sku_change_in'::text
  ]));

CREATE OR REPLACE FUNCTION public.sync_variant_current_stock()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  delta NUMERIC := 0;
BEGIN
  IF TG_OP = 'INSERT' THEN
    -- purchase_sku_change_* quantities are already signed (+ in / - out).
    IF NEW.movement_type IN (
      'purchase',
      'purchase_increase',
      'purchase_sku_change_in',
      'purchase_sku_change_out',
      'sale_return',
      'restore_purchase',
      'purchase_return_delete',
      'sale_delete',
      'restore_sale_return',
      'soft_delete_sale',
      'reconciliation'
    ) THEN
      delta := NEW.quantity;
    ELSIF NEW.movement_type IN (
      'sale',
      'purchase_decrease',
      'purchase_return',
      'soft_delete_purchase',
      'restore_sale',
      'purchase_delete',
      'soft_delete_sale_return',
      'soft_delete_purchase_return'
    ) THEN
      delta := -NEW.quantity;
    ELSIF NEW.movement_type IN ('reconciliation', 'stock_reset') THEN
      UPDATE product_variants SET current_stock = COALESCE(stock_qty, 0) WHERE id = NEW.variant_id;
      RETURN NEW;
    END IF;
    UPDATE product_variants SET current_stock = current_stock + delta
    WHERE id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$;
