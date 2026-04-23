-- Prerequisite: unique index on batch_stock for upsert
CREATE UNIQUE INDEX IF NOT EXISTS idx_batch_stock_variant_bill
  ON batch_stock(variant_id, bill_number);

-- ============================================================
-- FIX 1: handle_purchase_item_update — handle sku_id changes
-- ============================================================
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
BEGIN
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

  -- CASE A: sku_id changed — fully reverse OLD, fully add NEW
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

  -- CASE B: same sku_id, qty changed
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

-- ============================================================
-- FIX 2: soft_delete_purchase_bill — block negative stock
-- ============================================================
CREATE OR REPLACE FUNCTION public.soft_delete_purchase_bill(p_bill_id uuid, p_user_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_current_stock INTEGER;
BEGIN
  SELECT organization_id INTO v_org_id FROM purchase_bills WHERE id = p_bill_id;

  FOR v_item IN
    SELECT pi.sku_id, pi.qty, pi.bill_number, pi.product_name, pi.size
    FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NULL AND pi.sku_id IS NOT NULL
  LOOP
    SELECT stock_qty INTO v_current_stock FROM product_variants WHERE id = v_item.sku_id;
    IF v_current_stock < v_item.qty THEN
      RAISE EXCEPTION 'Cannot delete: stock would go negative for % (size %). Current: %, need to reverse: %. Delete the sales that consumed this stock first.',
        v_item.product_name, v_item.size, v_current_stock, v_item.qty;
    END IF;
  END LOOP;

  FOR v_item IN SELECT pi.sku_id, pi.qty, pi.bill_number FROM purchase_items pi
    WHERE pi.bill_id = p_bill_id AND pi.deleted_at IS NULL AND pi.sku_id IS NOT NULL
  LOOP
    UPDATE product_variants
    SET stock_qty = stock_qty - v_item.qty, updated_at = now()
    WHERE id = v_item.sku_id;

    UPDATE batch_stock
    SET quantity = GREATEST(0, quantity - v_item.qty), updated_at = now()
    WHERE variant_id = v_item.sku_id AND purchase_bill_id = p_bill_id;

    DELETE FROM batch_stock
    WHERE variant_id = v_item.sku_id
      AND purchase_bill_id = p_bill_id
      AND quantity <= 0;

    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, organization_id, notes, bill_number, user_id)
    VALUES (v_item.sku_id, 'soft_delete_purchase', -v_item.qty, p_bill_id, v_org_id,
      'Stock reversed - purchase bill moved to recycle bin', v_item.bill_number, auth.uid());
  END LOOP;

  UPDATE purchase_items SET deleted_at = now(), deleted_by = p_user_id WHERE bill_id = p_bill_id;

  UPDATE voucher_entries SET deleted_at = now(), deleted_by = p_user_id
    WHERE reference_id = p_bill_id AND deleted_at IS NULL;

  UPDATE purchase_bills SET deleted_at = now(), deleted_by = p_user_id WHERE id = p_bill_id;
END; $$;

-- ============================================================
-- FIX 3: update_purchase_return_items — atomic edit RPC
-- ============================================================
CREATE OR REPLACE FUNCTION public.update_purchase_return_items(
  p_return_id uuid,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_item jsonb;
  v_violations INTEGER;
BEGIN
  WITH current_returns AS (
    SELECT sku_id, SUM(qty) as returned_qty
    FROM purchase_return_items
    WHERE return_id = p_return_id AND deleted_at IS NULL
    GROUP BY sku_id
  ),
  new_requests AS (
    SELECT
      (item->>'sku_id')::uuid as sku_id,
      SUM((item->>'qty')::integer) as qty
    FROM jsonb_array_elements(p_items) as item
    GROUP BY (item->>'sku_id')::uuid
  ),
  stock_check AS (
    SELECT
      nr.sku_id, nr.qty as new_qty,
      COALESCE(cr.returned_qty, 0) as old_qty,
      pv.stock_qty,
      pv.stock_qty + COALESCE(cr.returned_qty, 0) as available_after_reverse
    FROM new_requests nr
    JOIN product_variants pv ON pv.id = nr.sku_id
    LEFT JOIN current_returns cr ON cr.sku_id = nr.sku_id
  )
  SELECT COUNT(*) INTO v_violations
  FROM stock_check WHERE available_after_reverse < new_qty;

  IF v_violations > 0 THEN
    RAISE EXCEPTION 'Insufficient stock for updated purchase return. Adjust quantities or delete sales first.';
  END IF;

  DELETE FROM purchase_return_items WHERE return_id = p_return_id;

  FOR v_item IN SELECT * FROM jsonb_array_elements(p_items) LOOP
    INSERT INTO purchase_return_items (
      return_id, product_id, sku_id, size, color, qty,
      pur_price, gst_per, hsn_code, barcode, line_total
    )
    VALUES (
      p_return_id,
      (v_item->>'product_id')::uuid,
      (v_item->>'sku_id')::uuid,
      v_item->>'size',
      v_item->>'color',
      (v_item->>'qty')::integer,
      (v_item->>'pur_price')::numeric,
      (v_item->>'gst_per')::numeric,
      v_item->>'hsn_code',
      v_item->>'barcode',
      (v_item->>'line_total')::numeric
    );
  END LOOP;

  RETURN jsonb_build_object('success', true, 'item_count', jsonb_array_length(p_items));
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Purchase return update failed: %', SQLERRM;
END;
$$;

-- ============================================================
-- FIX 4: handle_purchase_return_item_delete — preserve FIFO
-- ============================================================
CREATE OR REPLACE FUNCTION public.handle_purchase_return_item_delete()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  v_org_id UUID;
  v_batch RECORD;
  v_remaining_qty INTEGER := OLD.qty;
  v_restore_qty INTEGER;
BEGIN
  IF OLD.deleted_at IS NOT NULL THEN RETURN OLD; END IF;

  SELECT organization_id INTO v_org_id FROM purchase_returns WHERE id = OLD.return_id;

  UPDATE product_variants
  SET stock_qty = stock_qty + OLD.qty, updated_at = NOW()
  WHERE id = OLD.sku_id;

  FOR v_batch IN
    SELECT bs.id, bs.bill_number, bs.quantity,
           COALESCE((
             SELECT SUM(ABS(sm.quantity))
             FROM stock_movements sm
             WHERE sm.variant_id = OLD.sku_id
               AND sm.bill_number = bs.bill_number
               AND sm.movement_type = 'purchase_return'
               AND sm.reference_id = OLD.return_id
           ), 0) as previously_deducted
    FROM batch_stock bs
    WHERE bs.variant_id = OLD.sku_id
    ORDER BY bs.purchase_date DESC, bs.created_at DESC
  LOOP
    EXIT WHEN v_remaining_qty <= 0;

    v_restore_qty := LEAST(v_remaining_qty, v_batch.previously_deducted);

    IF v_restore_qty > 0 THEN
      UPDATE batch_stock
      SET quantity = quantity + v_restore_qty, updated_at = NOW()
      WHERE id = v_batch.id;

      INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
      VALUES (OLD.sku_id, 'purchase_return_delete', v_restore_qty, OLD.return_id, v_batch.bill_number,
        'Purchase return deleted: ' || v_restore_qty || ' units restored to batch ' || v_batch.bill_number,
        v_org_id, auth.uid());

      v_remaining_qty := v_remaining_qty - v_restore_qty;
    END IF;
  END LOOP;

  IF v_remaining_qty > 0 THEN
    INSERT INTO stock_movements (variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id)
    VALUES (OLD.sku_id, 'purchase_return_delete', v_remaining_qty, OLD.return_id, NULL,
      'Purchase return deleted: ' || v_remaining_qty || ' units (original batch no longer available)',
      v_org_id, auth.uid());
  END IF;

  RETURN OLD;
EXCEPTION
  WHEN OTHERS THEN
    RAISE EXCEPTION 'Error in purchase_return_item_delete trigger: %', SQLERRM;
END;
$$;