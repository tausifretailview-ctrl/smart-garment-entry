-- Permanent delete of purchase bills: one transaction, stock-safe.
-- Replaces client multi-step hard delete (items → batch_stock → header) which
-- skipped stock reverse when purchase_items.deleted_at was already set.

CREATE OR REPLACE FUNCTION public.hard_delete_purchase_bill(
  p_bill_id uuid,
  p_user_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $function$
DECLARE
  v_org_id uuid;
  v_bill_number text;
  v_deleted_at timestamptz;
  v_short RECORD;
  v_reversed_units numeric := 0;
  v_reversed_variants integer := 0;
  v_caller uuid;
BEGIN
  v_caller := auth.uid();
  IF v_caller IS NULL THEN
    RAISE EXCEPTION 'Not authenticated';
  END IF;

  SELECT
    pb.organization_id,
    COALESCE(pb.software_bill_no, pb.supplier_invoice_no, pb.id::text),
    pb.deleted_at
  INTO v_org_id, v_bill_number, v_deleted_at
  FROM public.purchase_bills pb
  WHERE pb.id = p_bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill not found';
  END IF;

  PERFORM public.assert_org_member(v_org_id);

  IF NOT public.has_org_role(v_caller, v_org_id, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only org admin can permanently delete purchase bills';
  END IF;

  -- Unreversed purchase-family net still credited against this bill id.
  -- Positive net means stock was never fully reversed (B0326034 class).
  CREATE TEMP TABLE IF NOT EXISTS tmp_hard_delete_purchase_imbalance (
    variant_id uuid PRIMARY KEY,
    net_qty numeric NOT NULL
  ) ON COMMIT DROP;
  DELETE FROM tmp_hard_delete_purchase_imbalance;

  INSERT INTO tmp_hard_delete_purchase_imbalance (variant_id, net_qty)
  SELECT
    sm.variant_id,
    sum(sm.quantity)::numeric AS net_qty
  FROM public.stock_movements sm
  JOIN public.product_variants pv ON pv.id = sm.variant_id
  JOIN public.products p ON p.id = pv.product_id
  WHERE sm.organization_id = v_org_id
    AND sm.reference_id = p_bill_id
    AND sm.deleted_at IS NULL
    AND sm.movement_type IN (
      'purchase',
      'purchase_delete',
      'soft_delete_purchase',
      'purchase_increase',
      'purchase_decrease'
    )
    AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
  GROUP BY sm.variant_id
  HAVING sum(sm.quantity) > 0.001;

  IF EXISTS (SELECT 1 FROM tmp_hard_delete_purchase_imbalance) THEN
    SELECT p.product_name, pv.size, pv.stock_qty, i.net_qty
      INTO v_short
    FROM tmp_hard_delete_purchase_imbalance i
    JOIN public.product_variants pv ON pv.id = i.variant_id
    JOIN public.products p ON p.id = pv.product_id
    WHERE pv.stock_qty < i.net_qty
    LIMIT 1;

    IF FOUND THEN
      RAISE EXCEPTION
        'Cannot permanently delete: stock would go negative for % (size %). Current: %, need to reverse: %. Delete sales that consumed this stock first, or repair stock, then retry.',
        v_short.product_name, v_short.size, v_short.stock_qty, v_short.net_qty;
    END IF;

    UPDATE public.product_variants pv
    SET stock_qty = pv.stock_qty - i.net_qty::integer,
        updated_at = now()
    FROM tmp_hard_delete_purchase_imbalance i
    WHERE pv.id = i.variant_id
      AND pv.organization_id = v_org_id;

    GET DIAGNOSTICS v_reversed_variants = ROW_COUNT;

    SELECT COALESCE(sum(net_qty), 0) INTO v_reversed_units
    FROM tmp_hard_delete_purchase_imbalance;

    -- Reverse remaining batch_stock for this bill (best-effort; rows may already be gone).
    UPDATE public.batch_stock bs
    SET quantity = GREATEST(0, bs.quantity - i.net_qty::integer),
        updated_at = now()
    FROM tmp_hard_delete_purchase_imbalance i
    WHERE bs.purchase_bill_id = p_bill_id
      AND bs.variant_id = i.variant_id
      AND bs.organization_id = v_org_id;

    DELETE FROM public.batch_stock
    WHERE purchase_bill_id = p_bill_id
      AND quantity <= 0;

    INSERT INTO public.stock_movements (
      variant_id,
      movement_type,
      quantity,
      reference_id,
      organization_id,
      notes,
      bill_number,
      user_id
    )
    SELECT
      i.variant_id,
      'soft_delete_purchase',
      -i.net_qty,
      p_bill_id,
      v_org_id,
      'Stock reversed on permanent delete — unbalanced purchase movements for bill '
        || v_bill_number,
      v_bill_number,
      v_caller
    FROM tmp_hard_delete_purchase_imbalance i;
  END IF;

  -- Structural purge (children then header). Item DELETE trigger skips soft-deleted
  -- lines; live lines would reverse again — so ensure live lines are soft-flagged first
  -- when imbalance was already handled via movements, OR reverse live lines via flag.
  -- Flag any remaining live items so the delete trigger does not double-reverse.
  UPDATE public.purchase_items
  SET deleted_at = COALESCE(deleted_at, now()),
      deleted_by = COALESCE(deleted_by, p_user_id)
  WHERE bill_id = p_bill_id
    AND deleted_at IS NULL;

  DELETE FROM public.batch_stock
  WHERE purchase_bill_id = p_bill_id;

  DELETE FROM public.purchase_items
  WHERE bill_id = p_bill_id;

  -- Soft-deleted vouchers may remain; leave them (recycle / audit). Header delete
  -- fires trg_purchase_bills_delete_purge_journal for journals.
  DELETE FROM public.purchase_bills
  WHERE id = p_bill_id
    AND organization_id = v_org_id;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Purchase bill delete failed (missing or wrong organization)';
  END IF;

  RETURN jsonb_build_object(
    'success', true,
    'bill_id', p_bill_id,
    'bill_number', v_bill_number,
    'was_soft_deleted', v_deleted_at IS NOT NULL,
    'reversed_variants', v_reversed_variants,
    'reversed_units', v_reversed_units
  );
END;
$function$;

COMMENT ON FUNCTION public.hard_delete_purchase_bill(uuid, uuid) IS
  'Admin-only permanent delete of a purchase bill in one transaction. Reverses any remaining positive purchase-family movement net for the bill before purging rows.';

GRANT EXECUTE ON FUNCTION public.hard_delete_purchase_bill(uuid, uuid) TO authenticated;
