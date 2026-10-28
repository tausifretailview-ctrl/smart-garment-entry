-- Stock Transfer: two-step send → accept (was one-step, 20270130120000).
--
-- Send: stock leaves the sending shop at once (transfer_out) and the transfer is
--   'pending'. Nothing is added in the receiving shop yet, so a line's
--   to_variant_id stays NULL until accept.
-- Accept (receiving shop admin/manager): the destination item is found or
--   created (same barcode) and stock lands there (transfer_in). Status 'accepted'.
-- Reject (receiving shop, while pending) / Cancel (sending shop, while pending):
--   stock goes back to the sender (transfer_out_cancel), cancelled_at is set.
-- Cancel after accept keeps the old rule (admin of both shops, stock must still
--   be in the receiving shop).
--
-- Stock recompute (_get_stock_reconciliation_rows, reconcile_variant_stock_qty,
-- reset_stock_from_transactions via _stock_transfer_net_for_variant) is NOT
-- changed: it already counts "out" on from_variant_id and "in" on to_variant_id
-- for transfers with cancelled_at IS NULL. A pending line has to_variant_id NULL,
-- so it counts as out (in transit) and not yet in; rejected/cancelled transfers
-- have cancelled_at set and count nowhere. Existing transfers become 'accepted'
-- (or 'cancelled'), so no stock number changes when this runs.
--
-- stock_movements types used are the existing transfer_out / transfer_in /
-- transfer_out_cancel / transfer_in_cancel (20270209120000).

-- 1. Columns -------------------------------------------------------------------

ALTER TABLE public.stock_transfers
  ADD COLUMN IF NOT EXISTS status text,
  ADD COLUMN IF NOT EXISTS accepted_at timestamptz,
  ADD COLUMN IF NOT EXISTS accepted_by uuid,
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS rejected_by uuid,
  ADD COLUMN IF NOT EXISTS reject_reason text;

UPDATE public.stock_transfers
   SET status = CASE WHEN cancelled_at IS NOT NULL THEN 'cancelled' ELSE 'accepted' END,
       accepted_at = COALESCE(accepted_at, created_at),
       accepted_by = COALESCE(accepted_by, created_by)
 WHERE status IS NULL;

ALTER TABLE public.stock_transfers ALTER COLUMN status SET DEFAULT 'pending';
ALTER TABLE public.stock_transfers ALTER COLUMN status SET NOT NULL;

ALTER TABLE public.stock_transfers DROP CONSTRAINT IF EXISTS stock_transfers_status_check;
ALTER TABLE public.stock_transfers
  ADD CONSTRAINT stock_transfers_status_check
  CHECK (status IN ('pending', 'accepted', 'rejected', 'cancelled'));

CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_org_status
  ON public.stock_transfers (to_organization_id, status);

ALTER TABLE public.stock_transfer_items ALTER COLUMN to_variant_id DROP NOT NULL;

-- 2. Who may accept / reject: admin or manager of the receiving shop ----------

CREATE OR REPLACE FUNCTION public._stock_transfer_can_receive(p_uid uuid, p_org_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.organization_members
    WHERE user_id = p_uid AND organization_id = p_org_id AND role IN ('admin', 'manager')
  );
$$;

REVOKE ALL ON FUNCTION public._stock_transfer_can_receive(uuid, uuid) FROM PUBLIC, anon, authenticated;

-- 3. Put a pending transfer's stock back in the sending shop ------------------
-- Internal: callers check rights and that the transfer is pending and locked.

CREATE OR REPLACE FUNCTION public._stock_transfer_return_to_sender(p_transfer_id uuid, p_note text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_t record;
  v_line record;
BEGIN
  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id;

  FOR v_line IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    PERFORM 1 FROM product_variants WHERE id = v_line.from_variant_id FOR UPDATE;
    UPDATE product_variants SET stock_qty = COALESCE(stock_qty, 0) + v_line.qty, updated_at = now()
      WHERE id = v_line.from_variant_id;

    INSERT INTO batch_stock (variant_id, organization_id, bill_number, purchase_date, quantity)
    VALUES (v_line.from_variant_id, v_t.from_organization_id, v_t.transfer_number, v_t.transfer_date, v_line.qty);

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id)
    VALUES (v_line.from_variant_id, v_t.from_organization_id, 'transfer_out_cancel', v_line.qty, p_transfer_id,
            v_t.transfer_number, p_note, auth.uid());
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public._stock_transfer_return_to_sender(uuid, text) FROM PUBLIC, anon, authenticated;

-- 4. Send (create) — stock leaves here, transfer waits for the other shop -------
-- p_items: [{ "variant_id": "<source variant uuid>", "qty": 2 }, ...]

CREATE OR REPLACE FUNCTION public.create_stock_transfer(
  p_from_organization_id uuid,
  p_to_organization_id uuid,
  p_items jsonb,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_transfer_id uuid;
  v_number text;
  v_seq integer;
  v_item record;
  v_src record;
  v_src_product record;
  v_remaining numeric;
  v_batch record;
  v_take numeric;
  v_total_qty numeric := 0;
  v_total_value numeric := 0;
  v_to_name text;
BEGIN
  IF v_uid IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_from_organization_id IS NULL OR p_to_organization_id IS NULL
     OR p_from_organization_id = p_to_organization_id THEN
    RAISE EXCEPTION 'Pick a different destination shop';
  END IF;
  IF NOT public.is_org_admin(v_uid, p_from_organization_id)
     OR NOT public.is_org_admin(v_uid, p_to_organization_id) THEN
    RAISE EXCEPTION 'Only an admin of both shops can transfer stock' USING ERRCODE = '42501';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'Scan at least one item';
  END IF;

  SELECT name INTO v_to_name FROM organizations WHERE id = p_to_organization_id;

  PERFORM pg_advisory_xact_lock(hashtext('stock_transfer_number_' || p_from_organization_id::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(transfer_number, '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_seq
    FROM stock_transfers
    WHERE from_organization_id = p_from_organization_id;
  v_number := 'ST/' || lpad(v_seq::text, 4, '0');

  INSERT INTO stock_transfers (transfer_number, from_organization_id, to_organization_id, notes, created_by, status)
  VALUES (v_number, p_from_organization_id, p_to_organization_id, NULLIF(trim(COALESCE(p_notes, '')), ''), v_uid, 'pending')
  RETURNING id INTO v_transfer_id;

  FOR v_item IN
    SELECT (e->>'variant_id')::uuid AS variant_id, SUM((e->>'qty')::numeric) AS qty
    FROM jsonb_array_elements(p_items) e
    GROUP BY (e->>'variant_id')::uuid
  LOOP
    IF v_item.qty IS NULL OR v_item.qty <= 0 THEN
      RAISE EXCEPTION 'Quantity must be more than 0';
    END IF;

    SELECT * INTO v_src FROM product_variants
    WHERE id = v_item.variant_id
      AND organization_id = p_from_organization_id
      AND deleted_at IS NULL
    FOR UPDATE;
    IF NOT FOUND THEN
      RAISE EXCEPTION 'Item not found in this shop';
    END IF;

    SELECT * INTO v_src_product FROM products WHERE id = v_src.product_id;
    IF COALESCE(v_src_product.product_type, 'goods') IN ('service', 'combo') THEN
      RAISE EXCEPTION '% is a service/combo item and has no stock to transfer', v_src_product.product_name;
    END IF;
    IF COALESCE(v_src.stock_qty, 0) < v_item.qty THEN
      RAISE EXCEPTION 'Not enough stock for % % (barcode %): have %, transfer %',
        v_src_product.product_name, COALESCE(v_src.size, ''), COALESCE(v_src.barcode, '-'),
        COALESCE(v_src.stock_qty, 0), v_item.qty;
    END IF;

    UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) - v_item.qty, updated_at = now()
      WHERE id = v_src.id;

    v_remaining := v_item.qty;
    FOR v_batch IN
      SELECT id, quantity FROM batch_stock
      WHERE variant_id = v_src.id AND quantity > 0
      ORDER BY purchase_date ASC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, v_batch.quantity);
      UPDATE batch_stock SET quantity = quantity - v_take, updated_at = now() WHERE id = v_batch.id;
      v_remaining := v_remaining - v_take;
    END LOOP;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id)
    VALUES (v_src.id, p_from_organization_id, 'transfer_out', -v_item.qty, v_transfer_id, v_number,
            'Stock transfer to ' || COALESCE(v_to_name, 'other shop') || ' (waiting for accept)', v_uid);

    INSERT INTO stock_transfer_items (
      transfer_id, from_variant_id, to_variant_id, product_name, barcode, size, color,
      qty, unit_cost, line_value, created_in_destination
    ) VALUES (
      v_transfer_id, v_src.id, NULL, v_src_product.product_name, v_src.barcode,
      v_src.size, v_src.color, v_item.qty, COALESCE(v_src.pur_price, 0),
      round(v_item.qty * COALESCE(v_src.pur_price, 0), 2), false
    );

    v_total_qty := v_total_qty + v_item.qty;
    v_total_value := v_total_value + round(v_item.qty * COALESCE(v_src.pur_price, 0), 2);
  END LOOP;

  UPDATE stock_transfers
    SET total_qty = v_total_qty, total_value = v_total_value
    WHERE id = v_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', v_transfer_id,
    'transfer_number', v_number,
    'total_qty', v_total_qty,
    'total_value', v_total_value,
    'created_products', 0,
    'status', 'pending'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, text) TO authenticated;

-- 5. Accept — receiving shop takes the stock in --------------------------------
-- A destination item that does not exist yet is created with the same barcode,
-- name, size, colour, GST and prices (same rules as the old one-step transfer).

CREATE OR REPLACE FUNCTION public.accept_stock_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t record;
  v_line record;
  v_src record;
  v_src_product record;
  v_dest_variant_id uuid;
  v_dest_product_id uuid;
  v_dest_size_group uuid;
  v_created boolean;
  v_created_count integer := 0;
  v_from_name text;
BEGIN
  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF v_uid IS NULL OR NOT public._stock_transfer_can_receive(v_uid, v_t.to_organization_id) THEN
    RAISE EXCEPTION 'Only an admin or manager of the receiving shop can accept this transfer' USING ERRCODE = '42501';
  END IF;
  IF v_t.status <> 'pending' THEN
    RAISE EXCEPTION 'Transfer % is already %', v_t.transfer_number, v_t.status;
  END IF;

  SELECT name INTO v_from_name FROM organizations WHERE id = v_t.from_organization_id;

  FOR v_line IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id ORDER BY created_at
  LOOP
    SELECT * INTO v_src FROM product_variants WHERE id = v_line.from_variant_id;
    SELECT * INTO v_src_product FROM products WHERE id = v_src.product_id;

    v_dest_variant_id := NULL;
    v_created := false;

    IF NULLIF(trim(COALESCE(v_src.barcode, '')), '') IS NOT NULL THEN
      SELECT pv.id INTO v_dest_variant_id
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.organization_id = v_t.to_organization_id
        AND pv.barcode = v_src.barcode
        AND pv.deleted_at IS NULL
        AND p.deleted_at IS NULL
      ORDER BY (lower(p.product_name) = lower(v_src_product.product_name)) DESC,
               (COALESCE(pv.size, '') = COALESCE(v_src.size, '')) DESC,
               pv.created_at
      LIMIT 1;
    END IF;

    IF v_dest_variant_id IS NULL THEN
      SELECT p.id INTO v_dest_product_id
      FROM products p
      WHERE p.organization_id = v_t.to_organization_id
        AND p.deleted_at IS NULL
        AND lower(trim(p.product_name)) = lower(trim(v_src_product.product_name))
      LIMIT 1;

      IF v_dest_product_id IS NULL THEN
        v_dest_size_group := NULL;
        IF v_src_product.size_group_id IS NOT NULL THEN
          SELECT dg.id INTO v_dest_size_group
          FROM size_groups sg
          JOIN size_groups dg
            ON dg.organization_id = v_t.to_organization_id
           AND lower(trim(dg.group_name)) = lower(trim(sg.group_name))
          WHERE sg.id = v_src_product.size_group_id
          LIMIT 1;
        END IF;

        INSERT INTO products (
          organization_id, product_name, brand, category, style, color, hsn_code,
          gst_per, purchase_gst_percent, sale_gst_percent, default_pur_price, default_sale_price,
          product_type, uom, size_group_id, status, image_url, requires_imei,
          sale_discount_type, sale_discount_value, purchase_discount_type, purchase_discount_value,
          pricing_sale_disc_percent
        ) VALUES (
          v_t.to_organization_id, v_src_product.product_name, v_src_product.brand, v_src_product.category,
          v_src_product.style, v_src_product.color, v_src_product.hsn_code,
          v_src_product.gst_per, v_src_product.purchase_gst_percent, v_src_product.sale_gst_percent,
          v_src_product.default_pur_price, v_src_product.default_sale_price,
          COALESCE(v_src_product.product_type, 'goods'), COALESCE(v_src_product.uom, 'NOS'),
          v_dest_size_group, COALESCE(v_src_product.status, 'active'), v_src_product.image_url,
          COALESCE(v_src_product.requires_imei, false),
          v_src_product.sale_discount_type, v_src_product.sale_discount_value,
          v_src_product.purchase_discount_type, v_src_product.purchase_discount_value,
          v_src_product.pricing_sale_disc_percent
        )
        RETURNING id INTO v_dest_product_id;
      END IF;

      INSERT INTO product_variants (
        organization_id, product_id, barcode, barcode_source, size, color,
        mrp, pur_price, sale_price, stock_qty, opening_qty, active
      ) VALUES (
        v_t.to_organization_id, v_dest_product_id, v_src.barcode, COALESCE(v_src.barcode_source, 'generated'),
        COALESCE(v_src.size, ''), v_src.color,
        v_src.mrp, v_src.pur_price, v_src.sale_price, 0, 0, true
      )
      RETURNING id INTO v_dest_variant_id;
      v_created := true;
      v_created_count := v_created_count + 1;
    END IF;

    PERFORM 1 FROM product_variants WHERE id = v_dest_variant_id FOR UPDATE;
    UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) + v_line.qty, updated_at = now()
      WHERE id = v_dest_variant_id;

    INSERT INTO batch_stock (variant_id, organization_id, bill_number, purchase_date, quantity)
    VALUES (v_dest_variant_id, v_t.to_organization_id, v_t.transfer_number, now(), v_line.qty);

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id)
    VALUES (v_dest_variant_id, v_t.to_organization_id, 'transfer_in', v_line.qty, p_transfer_id, v_t.transfer_number,
            'Stock transfer from ' || COALESCE(v_from_name, 'other shop'), v_uid);

    UPDATE stock_transfer_items
      SET to_variant_id = v_dest_variant_id, created_in_destination = v_created
      WHERE id = v_line.id;
  END LOOP;

  UPDATE stock_transfers
    SET status = 'accepted', accepted_at = now(), accepted_by = v_uid
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object(
    'transfer_id', p_transfer_id,
    'transfer_number', v_t.transfer_number,
    'total_qty', v_t.total_qty,
    'created_products', v_created_count,
    'status', 'accepted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_stock_transfer(uuid) TO authenticated;

-- 6. Reject — receiving shop sends it back (pending only) ---------------------

CREATE OR REPLACE FUNCTION public.reject_stock_transfer(p_transfer_id uuid, p_reason text DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t record;
BEGIN
  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF v_uid IS NULL OR NOT public._stock_transfer_can_receive(v_uid, v_t.to_organization_id) THEN
    RAISE EXCEPTION 'Only an admin or manager of the receiving shop can reject this transfer' USING ERRCODE = '42501';
  END IF;
  IF v_t.status <> 'pending' THEN
    RAISE EXCEPTION 'Transfer % is already %', v_t.transfer_number, v_t.status;
  END IF;

  PERFORM public._stock_transfer_return_to_sender(p_transfer_id, 'Stock transfer rejected by receiving shop');

  UPDATE stock_transfers
    SET status = 'rejected', rejected_at = now(), rejected_by = v_uid,
        reject_reason = NULLIF(trim(COALESCE(p_reason, '')), ''),
        cancelled_at = now(), cancelled_by = v_uid
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'status', 'rejected');
END;
$$;

REVOKE ALL ON FUNCTION public.reject_stock_transfer(uuid, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.reject_stock_transfer(uuid, text) TO authenticated;

-- 7. Cancel — sending shop. Pending: stock comes back. Accepted: old rule. ------

CREATE OR REPLACE FUNCTION public.cancel_stock_transfer(p_transfer_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_uid uuid := auth.uid();
  v_t record;
  v_line record;
  v_dest record;
  v_remaining numeric;
  v_batch record;
  v_take numeric;
BEGIN
  SELECT * INTO v_t FROM stock_transfers WHERE id = p_transfer_id FOR UPDATE;
  IF NOT FOUND THEN
    RAISE EXCEPTION 'Transfer not found';
  END IF;
  IF v_t.status IN ('cancelled', 'rejected') OR v_t.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Transfer % is already %', v_t.transfer_number, v_t.status;
  END IF;

  IF v_t.status = 'pending' THEN
    IF v_uid IS NULL OR NOT public.is_org_admin(v_uid, v_t.from_organization_id) THEN
      RAISE EXCEPTION 'Only an admin of the sending shop can cancel this transfer' USING ERRCODE = '42501';
    END IF;

    PERFORM public._stock_transfer_return_to_sender(p_transfer_id, 'Stock transfer cancelled');

    UPDATE stock_transfers
      SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
      WHERE id = p_transfer_id;

    RETURN jsonb_build_object('transfer_id', p_transfer_id, 'cancelled', true, 'status', 'cancelled');
  END IF;

  IF v_uid IS NULL
     OR NOT public.is_org_admin(v_uid, v_t.from_organization_id)
     OR NOT public.is_org_admin(v_uid, v_t.to_organization_id) THEN
    RAISE EXCEPTION 'Only an admin of both shops can cancel a received transfer' USING ERRCODE = '42501';
  END IF;

  FOR v_line IN SELECT * FROM stock_transfer_items WHERE transfer_id = p_transfer_id
  LOOP
    SELECT pv.*, p.product_name INTO v_dest
    FROM product_variants pv JOIN products p ON p.id = pv.product_id
    WHERE pv.id = v_line.to_variant_id
    FOR UPDATE OF pv;
    IF COALESCE(v_dest.stock_qty, 0) < v_line.qty THEN
      RAISE EXCEPTION 'Cannot cancel: % % has only % left in the receiving shop (needs %)',
        v_dest.product_name, COALESCE(v_dest.size, ''), COALESCE(v_dest.stock_qty, 0), v_line.qty;
    END IF;

    UPDATE product_variants SET stock_qty = COALESCE(stock_qty, 0) - v_line.qty, updated_at = now()
      WHERE id = v_line.to_variant_id;
    UPDATE product_variants SET stock_qty = COALESCE(stock_qty, 0) + v_line.qty, updated_at = now()
      WHERE id = v_line.from_variant_id;

    v_remaining := v_line.qty;
    FOR v_batch IN
      SELECT id, quantity FROM batch_stock
      WHERE variant_id = v_line.to_variant_id AND quantity > 0
      ORDER BY (bill_number = v_t.transfer_number) DESC, purchase_date DESC
      FOR UPDATE
    LOOP
      EXIT WHEN v_remaining <= 0;
      v_take := LEAST(v_remaining, v_batch.quantity);
      UPDATE batch_stock SET quantity = quantity - v_take, updated_at = now() WHERE id = v_batch.id;
      v_remaining := v_remaining - v_take;
    END LOOP;

    INSERT INTO batch_stock (variant_id, organization_id, bill_number, purchase_date, quantity)
    VALUES (v_line.from_variant_id, v_t.from_organization_id, v_t.transfer_number, v_t.transfer_date, v_line.qty);

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id)
    VALUES
      (v_line.to_variant_id, v_t.to_organization_id, 'transfer_in_cancel', -v_line.qty, p_transfer_id, v_t.transfer_number,
       'Stock transfer cancelled', v_uid),
      (v_line.from_variant_id, v_t.from_organization_id, 'transfer_out_cancel', v_line.qty, p_transfer_id, v_t.transfer_number,
       'Stock transfer cancelled', v_uid);
  END LOOP;

  UPDATE stock_transfers
    SET status = 'cancelled', cancelled_at = now(), cancelled_by = v_uid
    WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'cancelled', true, 'status', 'cancelled');
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer(uuid) TO authenticated;

-- 8. Names of the other shops in this shop's transfers ------------------------
-- A manager of the receiving shop is not a member of the sending shop, so the
-- organizations table (RLS) does not give them its name.

CREATE OR REPLACE FUNCTION public.get_stock_transfer_shop_names(p_organization_id uuid)
RETURNS TABLE (id uuid, name text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.name
  FROM public.organizations o
  WHERE p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    AND o.id IN (
      SELECT t.from_organization_id FROM public.stock_transfers t WHERE t.to_organization_id = p_organization_id
      UNION
      SELECT t.to_organization_id FROM public.stock_transfers t WHERE t.from_organization_id = p_organization_id
    );
$$;

REVOKE ALL ON FUNCTION public.get_stock_transfer_shop_names(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_stock_transfer_shop_names(uuid) TO authenticated;

NOTIFY pgrst, 'reload schema';
