-- Repack (supermarket go-live, Nov 2026): break bulk stock into packets, e.g. one 50 kg sack
-- of sugar into 50 packets of 1 kg, or 2 kg loose into 8 packets of 250 g.
--
-- repack_stock(org, from item, qty out, to item, qty in, packing cost, notes), one transaction:
--   * both item rows are locked (in id order, so two repacks never wait on each other);
--   * stock and opening move together on both rows, like Stock Adjustment, so stock
--     reconciliation and drift checks stay balanced;
--   * the packets' purchase price becomes the weighted average of the packets already in
--     stock and the new ones (cost of the bulk used + packing cost);
--   * two stock_movements rows ('reconciliation', bill number RPK-…), one per item;
--   * the shop's negative-stock rule (trigger on product_variants) still applies.
-- SECURITY INVOKER + membership check: the same RLS and triggers as Stock Adjustment.
-- Safe to run more than once. UNDO: DROP FUNCTION public.repack_stock(uuid, uuid, numeric, uuid, numeric, numeric, text);

CREATE OR REPLACE FUNCTION public.repack_stock(
  p_organization_id uuid,
  p_from_variant_id uuid,
  p_from_qty numeric,
  p_to_variant_id uuid,
  p_to_qty numeric,
  p_packing_cost numeric DEFAULT 0,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_from record;
  v_to record;
  v_bill text;
  v_cost_used numeric;
  v_to_cost numeric;
  v_on_hand numeric;
  v_note text;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_from_variant_id IS NULL OR p_to_variant_id IS NULL OR p_from_variant_id = p_to_variant_id THEN
    RAISE EXCEPTION 'Pick two different items' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_from_qty, 0) <= 0 OR coalesce(p_to_qty, 0) <= 0 THEN
    RAISE EXCEPTION 'Quantities must be more than 0' USING ERRCODE = '22023';
  END IF;
  IF coalesce(p_packing_cost, 0) < 0 THEN
    RAISE EXCEPTION 'Packing cost cannot be negative' USING ERRCODE = '22023';
  END IF;

  -- Lock both rows, lowest id first.
  PERFORM 1 FROM product_variants
  WHERE id IN (p_from_variant_id, p_to_variant_id) AND organization_id = p_organization_id
  ORDER BY id
  FOR UPDATE;

  SELECT v.id, coalesce(v.stock_qty, 0) AS stock_qty, coalesce(v.opening_qty, 0) AS opening_qty,
         coalesce(v.pur_price, 0) AS pur_price, v.size, p.product_name
  INTO v_from
  FROM product_variants v JOIN products p ON p.id = v.product_id
  WHERE v.id = p_from_variant_id AND v.organization_id = p_organization_id AND v.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Bulk item not found' USING ERRCODE = 'P0002';
  END IF;

  SELECT v.id, coalesce(v.stock_qty, 0) AS stock_qty, coalesce(v.opening_qty, 0) AS opening_qty,
         coalesce(v.pur_price, 0) AS pur_price, v.size, p.product_name
  INTO v_to
  FROM product_variants v JOIN products p ON p.id = v.product_id
  WHERE v.id = p_to_variant_id AND v.organization_id = p_organization_id AND v.deleted_at IS NULL;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Packet item not found' USING ERRCODE = 'P0002';
  END IF;

  v_bill := 'RPK-' || to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYYMMDD-HH24MISS');
  v_cost_used := v_from.pur_price * p_from_qty + coalesce(p_packing_cost, 0);
  v_on_hand := greatest(v_to.stock_qty, 0);
  v_to_cost := round((v_on_hand * v_to.pur_price + v_cost_used) / (v_on_hand + p_to_qty), 2);
  v_note := 'Repack: ' || trim_scale(p_from_qty) || ' ' || v_from.product_name
         || ' → ' || trim_scale(p_to_qty) || ' ' || v_to.product_name
         || coalesce(' · ' || nullif(btrim(p_notes), ''), '');

  UPDATE product_variants
  SET stock_qty = v_from.stock_qty - p_from_qty,
      opening_qty = v_from.opening_qty - p_from_qty,
      updated_at = now()
  WHERE id = p_from_variant_id AND organization_id = p_organization_id;

  UPDATE product_variants
  SET stock_qty = v_to.stock_qty + p_to_qty,
      opening_qty = v_to.opening_qty + p_to_qty,
      pur_price = v_to_cost,
      updated_at = now()
  WHERE id = p_to_variant_id AND organization_id = p_organization_id;

  INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, notes, user_id, bill_number)
  VALUES
    (p_from_variant_id, p_organization_id, 'reconciliation', -p_from_qty, v_note, auth.uid(), v_bill),
    (p_to_variant_id, p_organization_id, 'reconciliation', p_to_qty, v_note, auth.uid(), v_bill);

  RETURN jsonb_build_object(
    'success', true,
    'bill_number', v_bill,
    'from_stock_after', v_from.stock_qty - p_from_qty,
    'to_stock_after', v_to.stock_qty + p_to_qty,
    'to_pur_price', v_to_cost
  );
END;
$$;

REVOKE ALL ON FUNCTION public.repack_stock(uuid, uuid, numeric, uuid, numeric, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.repack_stock(uuid, uuid, numeric, uuid, numeric, numeric, text) TO authenticated;

-- Checks (read-only) after running:
--   SELECT proname, prosecdef FROM pg_proc WHERE proname = 'repack_stock';   -- prosecdef = false
--   SELECT bill_number, quantity, notes FROM stock_movements WHERE bill_number LIKE 'RPK-%' ORDER BY created_at DESC LIMIT 4;
