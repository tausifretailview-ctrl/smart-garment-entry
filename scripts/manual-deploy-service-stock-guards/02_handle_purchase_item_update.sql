-- 2. handle_purchase_item_update
CREATE OR REPLACE FUNCTION public.handle_purchase_item_update()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_qty_difference INTEGER;
  v_purchase_date TIMESTAMPTZ;
  v_bill_number TEXT;
  v_org_id UUID;
  v_sku_changed BOOLEAN;
  v_product_type TEXT;
BEGIN
  -- Service product guard
  SELECT p.product_type INTO v_product_type
  FROM public.product_variants pv
  JOIN public.products p ON p.id = pv.product_id
  WHERE pv.id = COALESCE(NEW.sku_id, OLD.sku_id)
  LIMIT 1;

  IF v_product_type = 'service' THEN
    RETURN NEW;
  END IF;

  v_sku_changed := OLD.sku_id IS DISTINCT FROM NEW.sku_id;

  IF NOT v_sku_changed AND OLD.qty = NEW.qty THEN
    RETURN NEW;
  END IF;

  SELECT pb.bill_date, pb.software_bill_no, pb.organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM purchase_bills pb WHERE pb.id = NEW.bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Organization ID not found for purchase bill';
  END IF;

  IF v_sku_changed THEN
    IF OLD.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = stock_qty - OLD.qty, updated_at = NOW()
      WHERE id = OLD.sku_id;

      UPDATE batch_stock
      SET quantity = quantity - OLD.qty, updated_at = NOW()
      WHERE variant_id = OLD.sku_id AND bill_number = v_bill_number;

      DELETE FROM batch_stock
      WHERE variant_id = OLD.sku_id
        AND bill_number = v_bill_number
        AND quantity <= 0;

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (OLD.sku_id, 'purchase_sku_change_out', -OLD.qty, NEW.bill_id, v_bill_number,
        'Purchase variant changed: reversed ' || OLD.qty || ' from old variant in bill ' || v_bill_number,
        v_org_id, auth.uid());
    END IF;

    IF NEW.sku_id IS NOT NULL THEN
      UPDATE product_variants
      SET stock_qty = stock_qty + NEW.qty, updated_at = NOW()
      WHERE id = NEW.sku_id;

      INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
      VALUES (NEW.sku_id, v_bill_number, NEW.qty, NEW.bill_id, v_purchase_date, v_org_id)
      ON CONFLICT (variant_id, bill_number)
      DO UPDATE SET quantity = batch_stock.quantity + NEW.qty, updated_at = NOW();

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (NEW.sku_id, 'purchase_sku_change_in', NEW.qty, NEW.bill_id, v_bill_number,
        'Purchase variant changed: added ' || NEW.qty || ' to new variant in bill ' || v_bill_number,
        v_org_id, auth.uid());
    END IF;

    RETURN NEW;
  END IF;

  v_qty_difference := NEW.qty - OLD.qty;

  UPDATE product_variants
  SET stock_qty = stock_qty + v_qty_difference, updated_at = NOW()
  WHERE id = NEW.sku_id;

  INSERT INTO batch_stock (variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id)
  VALUES (NEW.sku_id, v_bill_number, v_qty_difference, NEW.bill_id, v_purchase_date, v_org_id)
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = batch_stock.quantity + v_qty_difference, updated_at = NOW();

  DELETE FROM batch_stock
  WHERE variant_id = NEW.sku_id
    AND bill_number = v_bill_number
    AND quantity <= 0;

  INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
  VALUES (NEW.sku_id,
    CASE WHEN v_qty_difference > 0 THEN 'purchase_increase' ELSE 'purchase_decrease' END,
    v_qty_difference, NEW.bill_id, v_bill_number,
    'Stock adjusted: Purchase qty changed from ' || OLD.qty || ' to ' || NEW.qty || ' in bill ' || v_bill_number,
    v_org_id, auth.uid());

  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_item_update trigger: %', SQLERRM;
END;
$$;

