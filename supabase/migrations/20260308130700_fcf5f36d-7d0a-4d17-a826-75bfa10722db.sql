
CREATE OR REPLACE FUNCTION public.restore_sale_return(p_return_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_item RECORD; v_org_id uuid; v_return_number text;
  v_remaining_qty INTEGER; v_batch RECORD;
  v_conflict boolean;
  v_new_number text;
  v_max_seq int;
BEGIN
  SELECT organization_id, return_number INTO v_org_id, v_return_number FROM sale_returns WHERE id = p_return_id;

  -- Check if return_number already exists for an active record
  SELECT EXISTS(
    SELECT 1 FROM sale_returns 
    WHERE organization_id = v_org_id AND return_number = v_return_number 
    AND deleted_at IS NULL AND id != p_return_id
  ) INTO v_conflict;

  IF v_conflict THEN
    -- Generate a new return number with suffix
    SELECT COALESCE(MAX(
      CASE WHEN return_number ~ ('^' || regexp_replace(v_return_number, '([^a-zA-Z0-9])', '\\\1', 'g') || '-R[0-9]+$')
        THEN CAST(substring(return_number from '-R([0-9]+)$') AS int)
        ELSE 0
      END
    ), 0) + 1 INTO v_max_seq
    FROM sale_returns WHERE organization_id = v_org_id;
    
    v_new_number := v_return_number || '-R' || v_max_seq;
    v_return_number := v_new_number;
    
    UPDATE sale_returns SET return_number = v_new_number, deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;
  ELSE
    UPDATE sale_returns SET deleted_at = NULL, deleted_by = NULL WHERE id = p_return_id;
  END IF;

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
END;
$$;
