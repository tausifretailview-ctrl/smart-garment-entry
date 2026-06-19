
-- Fix: save_purchase_bill_with_items_atomic was setting app.bulk_purchase_insert='1'
-- (which makes the per-row stock trigger skip work) but never calling
-- _apply_bulk_purchase_insert_effects to apply the stock/batch/movement updates.
-- Result: 17 bills saved since 2026-06-18 had stock_qty=0.

CREATE OR REPLACE FUNCTION public.save_purchase_bill_with_items_atomic(p_organization_id uuid, p_bill jsonb, p_items jsonb)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_no text;
  v_bill_id uuid;
  v_bad_line integer;
  v_bad_sku text;
  v_inserted_bill public.purchase_bills%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for organization %', p_organization_id;
  END IF;

  IF p_bill IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_bill and p_items (array) are required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one purchase line item is required';
  END IF;

  PERFORM set_config('statement_timeout', '300s', true);

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE(t.value->>'sku_id', '') = ''
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: sku_id is required', v_bad_line;
  END IF;

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE((t.value->>'qty')::numeric, 0) <= 0
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: qty must be greater than 0', v_bad_line;
  END IF;

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE(t.value->>'product_id', '') = ''
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: product_id is required', v_bad_line;
  END IF;

  SELECT t.ordinality::integer, t.value->>'sku_id'
  INTO v_bad_line, v_bad_sku
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_variants pv
    WHERE pv.id = (t.value->>'sku_id')::uuid
      AND pv.deleted_at IS NULL
      AND pv.organization_id = p_organization_id
  )
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: variant % not found for organization', v_bad_line, v_bad_sku;
  END IF;

  v_bill_no := public.generate_purchase_bill_number_atomic(p_organization_id);

  INSERT INTO public.purchase_bills (
    software_bill_no, organization_id, supplier_id, supplier_name,
    supplier_invoice_no, supplier_inv_auto_generated, bill_date, bill_entry_at,
    gross_amount, discount_amount, gst_amount, other_charges, net_amount,
    round_off, is_dc_purchase, created_by
  )
  VALUES (
    v_bill_no,
    p_organization_id,
    NULLIF(p_bill->>'supplier_id', '')::uuid,
    COALESCE(p_bill->>'supplier_name', ''),
    NULLIF(p_bill->>'supplier_invoice_no', ''),
    COALESCE((p_bill->>'supplier_inv_auto_generated')::boolean, false),
    COALESCE((p_bill->>'bill_date')::date, CURRENT_DATE),
    COALESCE((p_bill->>'bill_entry_at')::timestamptz, NOW()),
    COALESCE((p_bill->>'gross_amount')::numeric, 0),
    COALESCE((p_bill->>'discount_amount')::numeric, 0),
    COALESCE((p_bill->>'gst_amount')::numeric, 0),
    COALESCE((p_bill->>'other_charges')::numeric, 0),
    COALESCE((p_bill->>'net_amount')::numeric, 0),
    COALESCE((p_bill->>'round_off')::numeric, 0),
    COALESCE((p_bill->>'is_dc_purchase')::boolean, false),
    auth.uid()
  )
  RETURNING * INTO v_inserted_bill;

  v_bill_id := v_inserted_bill.id;

  PERFORM set_config('app.bulk_purchase_insert', '1', true);

  INSERT INTO public.purchase_items (
    bill_id, product_id, sku_id, product_name, size, qty,
    pur_price, sale_price, mrp, gst_per, hsn_code, barcode,
    line_total, bill_number, brand, category, color, style, is_dc_item
  )
  SELECT
    v_bill_id,
    (item->>'product_id')::uuid,
    (item->>'sku_id')::uuid,
    item->>'product_name',
    COALESCE(item->>'size', ''),
    COALESCE((item->>'qty')::numeric, 0),
    COALESCE((item->>'pur_price')::numeric, 0),
    COALESCE((item->>'sale_price')::numeric, 0),
    COALESCE((item->>'mrp')::numeric, 0),
    COALESCE((item->>'gst_per')::numeric, 0),
    NULLIF(item->>'hsn_code', ''),
    NULLIF(item->>'barcode', ''),
    COALESCE((item->>'line_total')::numeric, 0),
    v_bill_no,
    NULLIF(item->>'brand', ''),
    NULLIF(item->>'category', ''),
    NULLIF(item->>'color', ''),
    NULLIF(item->>'style', ''),
    COALESCE((item->>'is_dc_item')::boolean, false)
  FROM jsonb_array_elements(p_items) AS item;

  -- CRITICAL FIX: actually apply stock/batch/movement effects that the
  -- per-row trigger was instructed to skip via app.bulk_purchase_insert.
  PERFORM public._apply_bulk_purchase_insert_effects(v_bill_id);

  PERFORM set_config('app.bulk_purchase_insert', '', true);

  -- Refresh v_inserted_bill so total_qty (updated by the apply function) is returned.
  SELECT * INTO v_inserted_bill FROM public.purchase_bills WHERE id = v_bill_id;

  RETURN jsonb_build_object(
    'id', v_inserted_bill.id,
    'software_bill_no', v_inserted_bill.software_bill_no,
    'organization_id', v_inserted_bill.organization_id,
    'supplier_id', v_inserted_bill.supplier_id,
    'supplier_name', v_inserted_bill.supplier_name,
    'supplier_invoice_no', v_inserted_bill.supplier_invoice_no,
    'supplier_inv_auto_generated', v_inserted_bill.supplier_inv_auto_generated,
    'bill_date', v_inserted_bill.bill_date,
    'bill_entry_at', v_inserted_bill.bill_entry_at,
    'gross_amount', v_inserted_bill.gross_amount,
    'discount_amount', v_inserted_bill.discount_amount,
    'gst_amount', v_inserted_bill.gst_amount,
    'other_charges', v_inserted_bill.other_charges,
    'net_amount', v_inserted_bill.net_amount,
    'round_off', v_inserted_bill.round_off,
    'is_dc_purchase', v_inserted_bill.is_dc_purchase,
    'created_by', v_inserted_bill.created_by,
    'created_at', v_inserted_bill.created_at
  );
END;
$function$;

-- Backfill stock for every bill created since 2026-06-18 that has items but no
-- stock_movements (i.e. saved via the broken atomic RPC).
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT pb.id
    FROM public.purchase_bills pb
    WHERE pb.created_at >= '2026-06-18'
      AND pb.deleted_at IS NULL
      AND NOT pb.is_cancelled
      AND EXISTS (
        SELECT 1 FROM public.purchase_items pi
        WHERE pi.bill_id = pb.id AND pi.deleted_at IS NULL
      )
      AND NOT EXISTS (
        SELECT 1 FROM public.stock_movements sm
        WHERE sm.reference_id = pb.id AND sm.movement_type = 'purchase'
      )
  LOOP
    PERFORM public._apply_bulk_purchase_insert_effects(r.id);
  END LOOP;
END$$;
