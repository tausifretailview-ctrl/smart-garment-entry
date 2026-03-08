-- Add current_stock column
ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS current_stock NUMERIC(10,2) DEFAULT 0;

-- Backfill from existing stock_movements using actual movement_type values
UPDATE public.product_variants pv
SET current_stock = COALESCE((
  SELECT SUM(
    CASE
      WHEN sm.movement_type IN ('purchase','purchase_increase','sale_return','restore_purchase','purchase_return_delete','sale_delete','restore_sale_return','soft_delete_sale','reconciliation') THEN sm.quantity
      WHEN sm.movement_type IN ('sale','purchase_decrease','purchase_return','soft_delete_purchase','restore_sale','purchase_delete','soft_delete_sale_return','soft_delete_purchase_return','stock_reset') THEN -sm.quantity
      ELSE 0
    END
  )
  FROM stock_movements sm
  WHERE sm.variant_id = pv.id
), 0);

-- Create trigger function to keep it updated
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
    IF NEW.movement_type IN ('purchase','purchase_increase','sale_return','restore_purchase','purchase_return_delete','sale_delete','restore_sale_return','soft_delete_sale') THEN
      delta := NEW.quantity;
    ELSIF NEW.movement_type IN ('sale','purchase_decrease','purchase_return','soft_delete_purchase','restore_sale','purchase_delete','soft_delete_sale_return','soft_delete_purchase_return') THEN
      delta := -NEW.quantity;
    ELSIF NEW.movement_type IN ('reconciliation','stock_reset') THEN
      -- For reconciliation/reset, recalculate from scratch
      UPDATE product_variants SET current_stock = COALESCE(stock_qty, 0) WHERE id = NEW.variant_id;
      RETURN NEW;
    END IF;
    UPDATE product_variants SET current_stock = current_stock + delta
    WHERE id = NEW.variant_id;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_variant_current_stock ON stock_movements;
CREATE TRIGGER trg_sync_variant_current_stock
  AFTER INSERT ON stock_movements
  FOR EACH ROW EXECUTE FUNCTION public.sync_variant_current_stock();

-- Index for stock level queries (e.g. low stock alerts)
CREATE INDEX IF NOT EXISTS idx_variants_low_stock
  ON public.product_variants(organization_id, current_stock)
  WHERE deleted_at IS NULL AND active = true;