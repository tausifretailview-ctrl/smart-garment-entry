-- Batch and expiry (supermarket phase 2, Nov 2026).
--
-- Each purchase bill already makes its own stock lot (batch_stock, one row per item per bill;
-- sales take the oldest lot first). A purchase line can now carry a batch number, mfg date and
-- expiry date; the lot left from that bill carries that expiry.
--
-- * purchase_items.batch_no / mfg_date / expiry_date.
-- * set_purchase_line_batches(org, bill, lines): written right after the bill is saved (the
--   purchase save itself is unchanged); lines are matched by item (sku_id), or barcode.
-- * get_expiry_report(org, within_days): stock still on hand from lots that expire within the
--   days given, or already expired, with quantity, cost, days left and the supplier.
-- * get_variant_expiry_status(org, variant_ids): for billing — when the lot that sells next
--   (oldest purchase first) expires, and the earliest expiry among the stock on hand.
-- * write_off_expired_lot(org, bill, item, qty, notes): writes the lot off as wastage (reason
--   'expired', same as Wastage / Damage) and takes the quantity out of that lot, so it leaves
--   the report and billing stops warning about it.
-- Reads and the write-off: SECURITY DEFINER with the membership check (stock lots are not
-- writable by users directly). set_purchase_line_batches: SECURITY INVOKER (row rules apply).
-- Safe to run more than once.

ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS batch_no text;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS mfg_date date;
ALTER TABLE public.purchase_items ADD COLUMN IF NOT EXISTS expiry_date date;

CREATE INDEX IF NOT EXISTS purchase_items_bill_sku_expiry_idx
  ON public.purchase_items (bill_id, sku_id) WHERE expiry_date IS NOT NULL;

CREATE OR REPLACE FUNCTION public.set_purchase_line_batches(
  p_organization_id uuid,
  p_bill_id uuid,
  p_lines jsonb  -- [{ "sku_id": uuid?, "barcode": text?, "batch_no": text?, "mfg_date": "yyyy-mm-dd"?, "expiry_date": "yyyy-mm-dd"? }]
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_line jsonb;
  v_n int;
  v_total int := 0;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF NOT EXISTS (SELECT 1 FROM purchase_bills WHERE id = p_bill_id AND organization_id = p_organization_id) THEN
    RAISE EXCEPTION 'Bill not found' USING ERRCODE = 'P0002';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RETURN jsonb_build_object('success', true, 'lines', 0);
  END IF;

  FOR v_line IN SELECT * FROM jsonb_array_elements(p_lines) LOOP
    UPDATE purchase_items pi
    SET batch_no = nullif(btrim(v_line ->> 'batch_no'), ''),
        mfg_date = nullif(v_line ->> 'mfg_date', '')::date,
        expiry_date = nullif(v_line ->> 'expiry_date', '')::date
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND (
        (nullif(v_line ->> 'sku_id', '') IS NOT NULL AND pi.sku_id = (v_line ->> 'sku_id')::uuid)
        OR (nullif(v_line ->> 'sku_id', '') IS NULL AND nullif(v_line ->> 'barcode', '') IS NOT NULL
            AND pi.barcode = v_line ->> 'barcode')
      );
    GET DIAGNOSTICS v_n = ROW_COUNT;
    v_total := v_total + v_n;
  END LOOP;
  RETURN jsonb_build_object('success', true, 'lines', v_total);
END;
$$;

-- The result columns changed while this file was written; drop first so a re-run never fails.
DROP FUNCTION IF EXISTS public.get_expiry_report(uuid, integer);
CREATE OR REPLACE FUNCTION public.get_expiry_report(p_org_id uuid, p_within_days integer DEFAULT 30)
RETURNS TABLE (
  variant_id uuid,
  purchase_bill_id uuid,
  product_name text,
  brand text,
  size text,
  barcode text,
  bill_number text,
  purchase_date date,
  supplier_name text,
  batch_no text,
  expiry_date date,
  days_left integer,
  lot_qty numeric,
  unit_cost numeric,
  cost_value numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
DECLARE
  v_today date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH lots AS (
    SELECT bs.variant_id, bs.bill_number, bs.quantity::numeric AS qty, pb.id AS bill_id,
           pb.bill_date::date AS bill_date, pb.supplier_name
    FROM batch_stock bs
    JOIN purchase_bills pb ON pb.id = bs.purchase_bill_id
    WHERE pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND bs.quantity > 0
  ),
  exp AS (
    SELECT lots.*, min(pi.expiry_date) AS expiry_date, max(pi.batch_no) AS batch_no
    FROM lots
    JOIN purchase_items pi ON pi.bill_id = lots.bill_id AND pi.sku_id = lots.variant_id
    WHERE pi.deleted_at IS NULL AND pi.expiry_date IS NOT NULL
    GROUP BY lots.variant_id, lots.bill_number, lots.qty, lots.bill_id, lots.bill_date, lots.supplier_name
  )
  SELECT exp.variant_id, exp.bill_id, p.product_name, p.brand, v.size, v.barcode, exp.bill_number, exp.bill_date,
         exp.supplier_name, exp.batch_no, exp.expiry_date, (exp.expiry_date - v_today)::integer,
         exp.qty, coalesce(v.pur_price, 0), round(exp.qty * coalesce(v.pur_price, 0), 2)
  FROM exp
  JOIN product_variants v ON v.id = exp.variant_id AND v.deleted_at IS NULL
  JOIN products p ON p.id = v.product_id AND p.deleted_at IS NULL
  WHERE exp.expiry_date <= v_today + GREATEST(0, LEAST(coalesce(p_within_days, 30), 365))
  ORDER BY exp.expiry_date, p.product_name;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_variant_expiry_status(p_org_id uuid, p_variant_ids uuid[])
RETURNS TABLE (variant_id uuid, next_lot_expiry date, earliest_expiry date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
#variable_conflict use_column
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_variant_ids IS NULL OR array_length(p_variant_ids, 1) IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH lots AS (
    SELECT bs.variant_id, bs.purchase_date, bs.created_at, pb.id AS bill_id
    FROM batch_stock bs
    JOIN purchase_bills pb ON pb.id = bs.purchase_bill_id
    WHERE bs.variant_id = ANY (p_variant_ids)
      AND pb.organization_id = p_org_id
      AND pb.deleted_at IS NULL
      AND bs.quantity > 0
  ),
  lot_exp AS (
    SELECT lots.variant_id, lots.purchase_date, lots.created_at,
           (SELECT min(pi.expiry_date) FROM purchase_items pi
             WHERE pi.bill_id = lots.bill_id AND pi.sku_id = lots.variant_id AND pi.deleted_at IS NULL) AS expiry_date
    FROM lots
  ),
  ranked AS (
    SELECT lot_exp.*, row_number() OVER (PARTITION BY lot_exp.variant_id ORDER BY lot_exp.purchase_date, lot_exp.created_at) AS rn
    FROM lot_exp
  )
  SELECT r.variant_id,
         max(r.expiry_date) FILTER (WHERE r.rn = 1),
         min(r.expiry_date)
  FROM ranked r
  GROUP BY r.variant_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.write_off_expired_lot(
  p_organization_id uuid,
  p_bill_id uuid,
  p_variant_id uuid,
  p_quantity numeric DEFAULT NULL,  -- NULL = everything left in the lot
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_lot record;
  v_qty numeric;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT bs.id, bs.quantity::numeric AS quantity
  INTO v_lot
  FROM batch_stock bs
  JOIN purchase_bills pb ON pb.id = bs.purchase_bill_id
  WHERE bs.purchase_bill_id = p_bill_id
    AND bs.variant_id = p_variant_id
    AND pb.organization_id = p_organization_id
  FOR UPDATE OF bs;
  IF NOT FOUND OR v_lot.quantity <= 0 THEN
    RAISE EXCEPTION 'Nothing left in this lot' USING ERRCODE = 'P0002';
  END IF;

  v_qty := least(coalesce(p_quantity, v_lot.quantity), v_lot.quantity);
  IF v_qty <= 0 THEN
    RAISE EXCEPTION 'Quantity must be more than 0' USING ERRCODE = '22023';
  END IF;

  -- Same entry as Wastage / Damage (stock, movement, wastage row with cost); its own checks apply.
  v_result := public.record_stock_wastage(
    p_organization_id,
    jsonb_build_array(jsonb_build_object('variant_id', p_variant_id, 'quantity', v_qty, 'reason', 'expired', 'notes', p_notes)),
    NULL
  );

  UPDATE batch_stock SET quantity = quantity - v_qty, updated_at = now() WHERE id = v_lot.id;

  RETURN v_result || jsonb_build_object('lot_qty_left', v_lot.quantity - v_qty);
END;
$$;

REVOKE ALL ON FUNCTION public.set_purchase_line_batches(uuid, uuid, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.set_purchase_line_batches(uuid, uuid, jsonb) TO authenticated;
REVOKE ALL ON FUNCTION public.get_expiry_report(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_expiry_report(uuid, integer) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.get_variant_expiry_status(uuid, uuid[]) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_variant_expiry_status(uuid, uuid[]) TO authenticated, service_role;
REVOKE ALL ON FUNCTION public.write_off_expired_lot(uuid, uuid, uuid, numeric, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.write_off_expired_lot(uuid, uuid, uuid, numeric, text) TO authenticated;

-- Checks (read-only) after running:
--   SELECT count(*) FILTER (WHERE expiry_date IS NOT NULL) FROM public.purchase_items;
