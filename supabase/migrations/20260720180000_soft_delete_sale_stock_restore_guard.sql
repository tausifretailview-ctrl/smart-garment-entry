-- Harden soft_delete_sale stock restore:
-- 1) No-op if sale already deleted (prevents double-restore on retry)
-- 2) Skip service products (sale insert never deducted them)
-- 3) Scope stock update by organization_id
-- 4) Return restored qty so UI can confirm stock came back

DROP FUNCTION IF EXISTS public.soft_delete_sale(uuid, uuid);

CREATE OR REPLACE FUNCTION public.soft_delete_sale(p_sale_id uuid, p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_item RECORD;
  v_org_id uuid;
  v_sale_number text;
  v_deleted_at timestamptz;
  v_sra numeric;
  v_remaining_qty integer;
  v_batch RECORD;
  v_product_type text;
  v_qty_restored integer := 0;
  v_lines integer := 0;
BEGIN
  SELECT organization_id, sale_number, deleted_at, COALESCE(sale_return_adjust, 0)
  INTO v_org_id, v_sale_number, v_deleted_at, v_sra
  FROM sales
  WHERE id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sale not found'
    );
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_deleted', true,
      'sale_number', v_sale_number,
      'qty_restored', 0,
      'lines', 0
    );
  END IF;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'Sale has no organization_id'
    );
  END IF;

  -- Unlink sale-return credit adjustments before stock restore
  IF v_sra > 0 THEN
    UPDATE sale_returns
    SET credit_status = 'pending',
        linked_sale_id = NULL,
        credit_available_balance = net_amount
    WHERE linked_sale_id = p_sale_id
      AND credit_status IN ('adjusted', 'partially_adjusted')
      AND deleted_at IS NULL;
  END IF;

  FOR v_item IN
    SELECT si.variant_id, si.quantity
    FROM sale_items si
    WHERE si.sale_id = p_sale_id
      AND si.deleted_at IS NULL
      AND si.variant_id IS NOT NULL
      AND COALESCE(si.quantity, 0) > 0
  LOOP
    -- Match update_stock_on_sale: service products never deducted stock
    SELECT p.product_type INTO v_product_type
    FROM product_variants pv
    JOIN products p ON p.id = pv.product_id
    WHERE pv.id = v_item.variant_id
    LIMIT 1;

    IF v_product_type = 'service' THEN
      CONTINUE;
    END IF;

    UPDATE product_variants
    SET stock_qty = stock_qty + v_item.quantity,
        updated_at = now()
    WHERE id = v_item.variant_id
      AND organization_id = v_org_id;

    IF NOT FOUND THEN
      RAISE EXCEPTION 'Variant % not found in organization %', v_item.variant_id, v_org_id;
    END IF;

    v_remaining_qty := v_item.quantity;
    FOR v_batch IN
      SELECT id
      FROM batch_stock
      WHERE variant_id = v_item.variant_id
      ORDER BY purchase_date ASC
    LOOP
      EXIT WHEN v_remaining_qty <= 0;
      UPDATE batch_stock
      SET quantity = quantity + v_remaining_qty,
          updated_at = now()
      WHERE id = v_batch.id;
      v_remaining_qty := 0;
    END LOOP;

    INSERT INTO stock_movements (
      variant_id, movement_type, quantity, reference_id,
      organization_id, notes, bill_number, user_id
    )
    VALUES (
      v_item.variant_id,
      'soft_delete_sale',
      v_item.quantity,
      p_sale_id,
      v_org_id,
      'Stock returned - sale moved to recycle bin',
      v_sale_number,
      COALESCE(auth.uid(), p_user_id)
    );

    v_qty_restored := v_qty_restored + v_item.quantity;
    v_lines := v_lines + 1;
  END LOOP;

  UPDATE sale_items
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE sale_id = p_sale_id
    AND deleted_at IS NULL;

  UPDATE voucher_entries
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE reference_id = p_sale_id
    AND reference_type IN ('sale', 'invoice', 'SALE')
    AND deleted_at IS NULL;

  IF v_sale_number IS NOT NULL AND length(trim(v_sale_number)) > 0 THEN
    UPDATE voucher_entries
    SET deleted_at = now(), deleted_by = p_user_id
    WHERE organization_id = v_org_id
      AND description ILIKE '%' || v_sale_number || '%'
      AND voucher_type IN ('receipt', 'credit_note')
      AND deleted_at IS NULL;
  END IF;

  UPDATE sales
  SET deleted_at = now(), deleted_by = p_user_id
  WHERE id = p_sale_id
    AND deleted_at IS NULL;

  RETURN jsonb_build_object(
    'success', true,
    'already_deleted', false,
    'sale_number', v_sale_number,
    'qty_restored', v_qty_restored,
    'lines', v_lines
  );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.soft_delete_sale(uuid, uuid) TO authenticated;

COMMENT ON FUNCTION public.soft_delete_sale(uuid, uuid) IS
  'Soft-delete a sale, restore product_variants.stock_qty for non-service lines, return qty_restored.';
