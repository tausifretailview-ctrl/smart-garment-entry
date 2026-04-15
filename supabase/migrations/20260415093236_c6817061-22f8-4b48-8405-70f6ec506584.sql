CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  -- Guard: skip if item is soft-deleted
  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Only adjust stock delta for active items (purchase_items uses 'qty' not 'quantity')
  IF NEW.qty != OLD.qty THEN
    UPDATE product_variants
    SET stock_qty = stock_qty + (NEW.qty - OLD.qty),
        updated_at = now()
    WHERE id = NEW.sku_id;

    -- Log the stock movement
    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    SELECT NEW.sku_id, pb.organization_id, 'purchase_edit',
           (NEW.qty - OLD.qty), NEW.bill_id,
           'Purchase item qty updated from ' || OLD.qty || ' to ' || NEW.qty
    FROM purchase_bills pb WHERE pb.id = NEW.bill_id;
  END IF;

  RETURN NEW;
END;
$function$;