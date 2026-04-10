CREATE OR REPLACE FUNCTION public.soft_delete_sale_return(p_return_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD; v_deduct_qty INTEGER;
  v_linked_sale_id uuid;
BEGIN
  SELECT organization_id, return_number, linked_sale_id 
  INTO v_org_id, v_return_number, v_linked_sale_id 
  FROM sale_returns WHERE id = p_return_id;
  
  -- Stock reversal
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
  
  -- Soft-delete linked credit notes (via linked sale)
  UPDATE credit_notes SET deleted_at = now(), deleted_by = p_user_id
    WHERE sale_id IN (SELECT id FROM sales WHERE id = v_linked_sale_id)
    AND deleted_at IS NULL;
  -- Also handle CN linked directly to the return
  UPDATE credit_notes SET deleted_at = now(), deleted_by = p_user_id
    WHERE id IN (SELECT credit_note_id FROM sale_returns WHERE id = p_return_id AND credit_note_id IS NOT NULL)
    AND deleted_at IS NULL;
  
  -- Soft-delete items and return
  UPDATE sale_return_items SET deleted_at = now(), deleted_by = p_user_id WHERE return_id = p_return_id;
  UPDATE sale_returns SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_return_id;
END; $$;