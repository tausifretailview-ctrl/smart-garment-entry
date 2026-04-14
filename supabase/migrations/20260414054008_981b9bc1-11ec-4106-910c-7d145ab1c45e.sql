-- Add deleted_at guard to handle_purchase_item_update
CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: skip if item is soft-deleted
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only adjust stock delta for active items
  IF NEW.quantity != OLD.quantity THEN
    UPDATE product_variants
    SET stock_qty = stock_qty + (NEW.quantity - OLD.quantity),
        updated_at = now()
    WHERE id = NEW.variant_id;

    -- Log the stock movement
    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    SELECT NEW.variant_id, pb.organization_id, 'purchase_edit',
           (NEW.quantity - OLD.quantity), NEW.purchase_bill_id,
           'Purchase item qty updated from ' || OLD.quantity || ' to ' || NEW.quantity
    FROM purchase_bills pb WHERE pb.id = NEW.purchase_bill_id;
  END IF;

  RETURN NEW;
END;
$$;

-- Add deleted_at guard to handle_sale_item_update
CREATE OR REPLACE FUNCTION public.handle_sale_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Guard: skip if item is soft-deleted
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only adjust stock delta for active items
  IF NEW.quantity != OLD.quantity THEN
    UPDATE product_variants
    SET stock_qty = stock_qty + (OLD.quantity - NEW.quantity),
        updated_at = now()
    WHERE id = NEW.variant_id;

    -- Log the stock movement
    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    SELECT NEW.variant_id, s.organization_id, 'sale_edit',
           (OLD.quantity - NEW.quantity), NEW.sale_id,
           'Sale item qty updated from ' || OLD.quantity || ' to ' || NEW.quantity
    FROM sales s WHERE s.id = NEW.sale_id;
  END IF;

  RETURN NEW;
END;
$$;