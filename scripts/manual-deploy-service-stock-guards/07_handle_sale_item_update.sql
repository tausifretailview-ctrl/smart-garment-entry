-- 7. handle_sale_item_update
CREATE OR REPLACE FUNCTION public.handle_sale_item_update()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = COALESCE(NEW.variant_id, OLD.variant_id)
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF NEW.quantity != OLD.quantity THEN
    UPDATE product_variants
    SET stock_qty = stock_qty + (OLD.quantity - NEW.quantity),
        updated_at = now()
    WHERE id = NEW.variant_id;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    SELECT NEW.variant_id, s.organization_id, 'sale_edit',
           (OLD.quantity - NEW.quantity), NEW.sale_id,
           'Sale item qty updated from ' || OLD.quantity || ' to ' || NEW.quantity
    FROM sales s WHERE s.id = NEW.sale_id;
  END IF;

  RETURN NEW;
END;
$$;

