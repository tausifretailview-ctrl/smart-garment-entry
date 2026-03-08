-- Fix FIFO restore loop bug: use v_batch.quantity instead of item quantity in LEAST()

-- 1. handle_sale_item_delete
CREATE OR REPLACE FUNCTION public.handle_sale_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_sale_number TEXT; v_org_id UUID;
  v_remaining_qty INTEGER := OLD.quantity;
  v_batch RECORD; v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT s.sale_number, s.organization_id INTO v_sale_number, v_org_id FROM sales s WHERE s.id = OLD.sale_id;
  IF v_org_id IS NULL THEN RAISE EXCEPTION 'Org not found'; END IF;
  UPDATE product_variants SET stock_qty = stock_qty + OLD.quantity, updated_at = NOW() WHERE id = OLD.variant_id;
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = OLD.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_delete', v_restore_qty, OLD.sale_id, v_batch.bill_number,
      'Stock restored (delete): ' || v_restore_qty || ' to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, notes, organization_id, user_id)
    VALUES (OLD.variant_id, 'sale_delete', v_remaining_qty, OLD.sale_id,
      'Stock restored (delete): ' || v_remaining_qty || ' from opening stock', v_org_id, auth.uid());
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Error in sale_item_delete: %', SQLERRM;
END; $$;

-- 2. restore_stock_on_sale_return
CREATE OR REPLACE FUNCTION public.restore_stock_on_sale_return()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_remaining_qty INTEGER := NEW.quantity;
  v_batch RECORD;
  v_restore_qty INTEGER;
  v_return_date DATE;
  v_org_id UUID;
BEGIN
  SELECT return_date, organization_id INTO v_return_date, v_org_id FROM sale_returns WHERE id = NEW.return_id;
  UPDATE product_variants SET stock_qty = stock_qty + NEW.quantity, updated_at = NOW() WHERE id = NEW.variant_id;
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = NEW.variant_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_restore_qty, NEW.return_id, v_batch.bill_number,
      'Sale return: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (NEW.variant_id, 'sale_return', v_remaining_qty, NEW.return_id, NULL,
      'Sale return to opening stock: ' || v_remaining_qty || ' units', v_org_id, auth.uid());
  END IF;
  RETURN NEW;
END; $$;

-- 3. handle_purchase_return_item_delete
CREATE OR REPLACE FUNCTION public.handle_purchase_return_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_org_id UUID;
  v_batch RECORD;
  v_remaining_qty INTEGER := OLD.qty;
  v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;
  SELECT organization_id INTO v_org_id FROM purchase_returns WHERE id = OLD.return_id;
  UPDATE product_variants SET stock_qty = stock_qty + OLD.qty, updated_at = NOW() WHERE id = OLD.sku_id;
  FOR v_batch IN SELECT id, bill_number, quantity FROM batch_stock WHERE variant_id = OLD.sku_id ORDER BY purchase_date ASC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;
    v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
    UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = NOW() WHERE id = v_batch.id;
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_restore_qty, OLD.return_id, v_batch.bill_number,
      'Purchase return deleted: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number, v_org_id, auth.uid());
    v_remaining_qty := v_remaining_qty - v_restore_qty;
  END LOOP;
  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_remaining_qty, OLD.return_id, NULL,
      'Purchase return deleted: ' || v_remaining_qty || ' units restored to opening stock', v_org_id, auth.uid());
  END IF;
  RETURN OLD;
EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'Error in purchase_return_item_delete trigger: %', SQLERRM;
END; $$;