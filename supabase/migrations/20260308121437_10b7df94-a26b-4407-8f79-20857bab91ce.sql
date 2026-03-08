
-- 1. soft_delete_sale: restore batch_stock FIFO (stock comes back)
CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_sale_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_restore_qty INTEGER;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number FROM sales WHERE id = p_sale_id;
  FOR v_item IN SELECT si.variant_id, si.quantity FROM sale_items si WHERE si.sale_id = p_sale_id AND si.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      -- Restore batch_stock FIFO
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id FROM batch_stock WHERE variant_id = v_item.variant_id ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        UPDATE batch_stock SET quantity = quantity + v_remaining_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := 0;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'soft_delete_sale', v_item.quantity, p_sale_id, v_org_id,
        'Stock returned - sale moved to recycle bin', v_sale_number, auth.uid());
    END IF;
  END LOOP;
  UPDATE sale_items SET deleted_at = now(), deleted_by = p_user_id WHERE sale_id = p_sale_id;
  UPDATE sales SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_sale_id;
END; $$;

-- 2. restore_sale: deduct batch_stock FIFO (sale recovered, stock goes out again)
CREATE OR REPLACE FUNCTION public.restore_sale(p_sale_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_sale_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
BEGIN
  SELECT organization_id, sale_number INTO v_org_id, v_sale_number FROM sales WHERE id = p_sale_id;
  UPDATE sales SET deleted_at = NULL, deleted_by = NULL WHERE id = p_sale_id;
  FOR v_item IN SELECT si.variant_id, si.quantity FROM sale_items si WHERE si.sale_id = p_sale_id AND si.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      -- Deduct batch_stock FIFO
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id, quantity FROM batch_stock WHERE variant_id = v_item.variant_id AND quantity > 0 ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
        UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := v_remaining_qty - v_deduct_qty;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'restore_sale', -v_item.quantity, p_sale_id, v_org_id,
        'Stock deducted - sale recovered from recycle bin', v_sale_number, auth.uid());
    END IF;
  END LOOP;
  UPDATE sale_items SET deleted_at = NULL, deleted_by = NULL WHERE sale_id = p_sale_id;
END; $$;

-- 3. soft_delete_sale_return: deduct batch_stock FIFO (return deleted, stock goes back out)
CREATE OR REPLACE FUNCTION public.soft_delete_sale_return(p_return_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;
  FOR v_item IN SELECT sri.variant_id, sri.quantity FROM sale_return_items sri WHERE sri.return_id = p_return_id AND sri.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      -- Deduct batch_stock FIFO
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id, quantity FROM batch_stock WHERE variant_id = v_item.variant_id AND quantity > 0 ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
        UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := v_remaining_qty - v_deduct_qty;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'soft_delete_sale_return', -v_item.quantity, p_return_id, v_org_id,
        'Stock reversed - sale return moved to recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  UPDATE sale_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;
  UPDATE sale_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END; $$;

-- 4. restore_sale_return: restore batch_stock FIFO (return recovered, stock comes back)
CREATE OR REPLACE FUNCTION public.restore_sale_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;
  UPDATE sale_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;
  FOR v_item IN SELECT sri.variant_id, sri.quantity FROM sale_return_items sri WHERE sri.return_id = p_return_id AND sri.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      -- Restore batch_stock FIFO
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id FROM batch_stock WHERE variant_id = v_item.variant_id ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        UPDATE batch_stock SET quantity = quantity + v_remaining_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := 0;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'restore_sale_return', v_item.quantity, p_return_id, v_org_id,
        'Stock restored - sale return recovered from recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  UPDATE sale_return_items SET deleted_at = NULL, deleted_by = NULL WHERE return_id = p_return_id;
END; $$;

-- 5. soft_delete_purchase_return: restore batch_stock FIFO (pur return deleted, stock comes back)
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_return(p_return_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;
  FOR v_item IN SELECT pri.sku_id, pri.qty FROM purchase_return_items pri WHERE pri.return_id = p_return_id AND pri.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      -- Restore batch_stock FIFO
      v_remaining_qty := v_item.qty;
      FOR v_batch IN SELECT id FROM batch_stock WHERE variant_id = v_item.sku_id ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        UPDATE batch_stock SET quantity = quantity + v_remaining_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := 0;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'soft_delete_purchase_return', v_item.qty, p_return_id, v_org_id,
        'Stock reversed - purchase return moved to recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  UPDATE purchase_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;
  UPDATE purchase_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END; $$;

-- 6. restore_purchase_return: deduct batch_stock FIFO (pur return recovered, stock goes out)
CREATE OR REPLACE FUNCTION public.restore_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;
  UPDATE purchase_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;
  FOR v_item IN SELECT pri.sku_id, pri.qty FROM purchase_return_items pri WHERE pri.return_id = p_return_id AND pri.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      -- Deduct batch_stock FIFO
      v_remaining_qty := v_item.qty;
      FOR v_batch IN SELECT id, quantity FROM batch_stock WHERE variant_id = v_item.sku_id AND quantity > 0 ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        v_deduct_qty := LEAST(v_remaining_qty, v_batch.quantity);
        UPDATE batch_stock SET quantity = quantity - v_deduct_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := v_remaining_qty - v_deduct_qty;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'restore_purchase_return', -v_item.qty, p_return_id, v_org_id,
        'Stock deducted - purchase return recovered from recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;
  UPDATE purchase_return_items SET deleted_at = NULL, deleted_by = NULL WHERE return_id = p_return_id;
END; $$;
