
-- 1. soft_delete_sale_return — handles credit notes + vouchers
CREATE OR REPLACE FUNCTION public.soft_delete_sale_return(p_return_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
  v_credit_note_id uuid;
BEGIN
  SELECT organization_id, return_number, credit_note_id
  INTO v_org_id, v_return_number, v_credit_note_id
  FROM sale_returns WHERE id = p_return_id;

  FOR v_item IN SELECT sri.variant_id, sri.quantity FROM sale_return_items sri
    WHERE sri.return_id = p_return_id AND sri.deleted_at IS NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
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

  IF v_credit_note_id IS NOT NULL THEN
    UPDATE credit_notes SET deleted_at = now(), deleted_by = p_user_id
      WHERE id = v_credit_note_id AND deleted_at IS NULL;
  END IF;

  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE organization_id = v_org_id
    AND deleted_at IS NULL
    AND (description ILIKE '%' || v_return_number || '%' OR reference_id = p_return_id);

  UPDATE sale_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;
  UPDATE sale_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END; $$;

-- 2. restore_sale_return — restores credit notes + vouchers
CREATE OR REPLACE FUNCTION public.restore_sale_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_restore_qty INTEGER;
  v_credit_note_id uuid;
BEGIN
  SELECT organization_id, return_number, credit_note_id
  INTO v_org_id, v_return_number, v_credit_note_id
  FROM sale_returns WHERE id = p_return_id;

  UPDATE sale_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;

  FOR v_item IN SELECT sri.variant_id, sri.quantity FROM sale_return_items sri
    WHERE sri.return_id = p_return_id AND sri.deleted_at IS NOT NULL
  LOOP
    IF v_item.variant_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.quantity, updated_at = now() WHERE id = v_item.variant_id;
      v_remaining_qty := v_item.quantity;
      FOR v_batch IN SELECT id, quantity FROM batch_stock WHERE variant_id = v_item.variant_id ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
        UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := v_remaining_qty - v_restore_qty;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.variant_id, 'restore_sale_return', v_item.quantity, p_return_id, v_org_id,
        'Stock restored - sale return recovered', v_return_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE sale_return_items SET deleted_at = NULL, deleted_by = NULL WHERE return_id = p_return_id;

  IF v_credit_note_id IS NOT NULL THEN
    UPDATE credit_notes SET deleted_at = NULL, deleted_by = NULL WHERE id = v_credit_note_id;
  END IF;

  UPDATE voucher_entries SET deleted_at = NULL, deleted_by = NULL
    WHERE organization_id = v_org_id
    AND (description ILIKE '%' || v_return_number || '%' OR reference_id = p_return_id);
END; $$;

-- 3. soft_delete_purchase_bill — handles supplier payment vouchers
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;

  FOR v_item IN SELECT pi.sku_id, pi.qty, pi.bill_number FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      UPDATE batch_stock SET quantity = quantity - v_item.qty, updated_at = now() WHERE variant_id = v_item.sku_id AND purchase_bill_id = p_bill_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'soft_delete_purchase', -v_item.qty, p_bill_id, v_org_id,
        'Stock reversed - purchase bill moved to recycle bin', v_item.bill_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE purchase_items SET deleted_at = now(), deleted_by = p_user_id WHERE bill_id = p_bill_id;

  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE reference_id = p_bill_id AND deleted_at IS NULL;

  UPDATE purchase_bills SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_bill_id;
END; $$;

-- 4. restore_purchase_bill — restores supplier payment vouchers
CREATE OR REPLACE FUNCTION public.restore_purchase_bill(p_bill_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid;
BEGIN
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;

  UPDATE purchase_bills SET deleted_at = NULL, deleted_by = NULL WHERE id = p_bill_id;

  FOR v_item IN SELECT pi.sku_id, pi.qty, pi.bill_number FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      UPDATE batch_stock SET quantity = quantity + v_item.qty, updated_at = now() WHERE variant_id = v_item.sku_id AND purchase_bill_id = p_bill_id;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'restore_purchase', v_item.qty, p_bill_id, v_org_id,
        'Stock restored - purchase bill recovered', v_item.bill_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE purchase_items SET deleted_at = NULL, deleted_by = NULL WHERE bill_id = p_bill_id;

  UPDATE voucher_entries SET deleted_at = NULL, deleted_by = NULL
    WHERE reference_id = p_bill_id;
END; $$;

-- 5. soft_delete_purchase_return — handles vouchers
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_return(p_return_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_restore_qty INTEGER;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;

  FOR v_item IN SELECT pri.sku_id, pri.qty FROM purchase_return_items pri
    WHERE pri.return_id = p_return_id AND pri.deleted_at IS NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty + v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
      v_remaining_qty := v_item.qty;
      FOR v_batch IN SELECT id, quantity FROM batch_stock WHERE variant_id = v_item.sku_id ORDER BY purchase_date ASC
      LOOP
        EXIT WHEN v_remaining_qty <= 0;
        v_restore_qty := LEAST(v_remaining_qty, v_batch.quantity);
        UPDATE batch_stock SET quantity = quantity + v_restore_qty, updated_at = now() WHERE id = v_batch.id;
        v_remaining_qty := v_remaining_qty - v_restore_qty;
      END LOOP;
      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
      VALUES (v_item.sku_id, 'soft_delete_purchase_return', v_item.qty, p_return_id, v_org_id,
        'Stock reversed - purchase return moved to recycle bin', v_return_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE purchase_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;

  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE organization_id = v_org_id
    AND deleted_at IS NULL
    AND (reference_id = p_return_id OR description ILIKE '%' || v_return_number || '%');

  UPDATE purchase_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END; $$;

-- 6. restore_purchase_return — restores vouchers
CREATE OR REPLACE FUNCTION public.restore_purchase_return(p_return_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM purchase_returns WHERE id = p_return_id;

  UPDATE purchase_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;

  FOR v_item IN SELECT pri.sku_id, pri.qty FROM purchase_return_items pri
    WHERE pri.return_id = p_return_id AND pri.deleted_at IS NOT NULL
  LOOP
    IF v_item.sku_id IS NOT NULL THEN
      UPDATE product_variants SET stock_qty = stock_qty - v_item.qty, updated_at = now() WHERE id = v_item.sku_id;
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
        'Stock deducted - purchase return recovered', v_return_number, auth.uid());
    END IF;
  END LOOP;

  UPDATE purchase_return_items SET deleted_at = NULL, deleted_by = NULL WHERE return_id = p_return_id;

  UPDATE voucher_entries SET deleted_at = NULL, deleted_by = NULL
    WHERE organization_id = v_org_id
    AND (reference_id = p_return_id OR description ILIKE '%' || v_return_number || '%');
END; $$;
