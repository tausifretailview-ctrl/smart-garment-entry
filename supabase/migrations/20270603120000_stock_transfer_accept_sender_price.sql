-- Stock Transfer: the receiving shop gets the sender's current sale price.
--
-- Reported 27 Nov 2026: a purchase bill's sale price was changed after saving, the item was
-- sent to the other shop, and a scan there showed the OLD price. The sending shop's price was
-- right: accept_stock_transfer (20270313120000) only added stock when the receiving shop
-- already had the item (same barcode, e.g. from an earlier transfer). Only items new to that
-- shop copied the sender's prices.
--
-- Now, on accept:
--   - several items with this barcode in the receiving shop (price tiers): the one at the
--     sender's sale price is used (before: the oldest);
--   - the item used is set to the sender's sale price and MRP when they differ. Purchase
--     price (stock value) is not changed. The change is logged by audit_variant_price_changes.
--   - the result also says how many prices changed ('prices_updated').
-- Same function signature, permissions and stock logic. Safe to re-run.
-- Transfers accepted before this keep the receiving shop's price: see the check at the end.
-- UNDO: re-run accept_stock_transfer from 20270313120000_stock_transfer_accept_flow.sql.

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
  v_price_updates integer := 0;
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
               -- Same barcode at several prices (price tiers): the one at the sender's price.
               (pv.sale_price IS NOT DISTINCT FROM v_src.sale_price) DESC,
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

    -- The item already existed here: it now sells at the sender's current price, so a scan
    -- shows the price the sender set (e.g. after editing the purchase bill). Only a real price
    -- is copied; the receiving shop's purchase price is left alone.
    IF NOT v_created AND COALESCE(v_src.sale_price, 0) > 0 THEN
      UPDATE product_variants
        SET sale_price = v_src.sale_price,
            mrp = CASE WHEN COALESCE(v_src.mrp, 0) > 0 THEN v_src.mrp ELSE mrp END,
            updated_at = now()
        WHERE id = v_dest_variant_id
          AND (sale_price IS DISTINCT FROM v_src.sale_price
               OR (COALESCE(v_src.mrp, 0) > 0 AND mrp IS DISTINCT FROM v_src.mrp));
      IF FOUND THEN
        v_price_updates := v_price_updates + 1;
      END IF;
    END IF;

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
    'prices_updated', v_price_updates,
    'status', 'accepted'
  );
END;
$$;

REVOKE ALL ON FUNCTION public.accept_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_stock_transfer(uuid) TO authenticated;

-- Check (read-only): items received by transfer whose price in the receiving shop still
-- differs from the sending shop's current price (accepted before this change, or changed
-- since). Lists shop names, barcode and both prices; changes nothing.
-- SELECT DISTINCT ON (dv.id)
--        fo.name AS from_shop, tor.name AS to_shop, sti.product_name, sv.barcode, sv.size,
--        sv.sale_price AS sender_sale_price, dv.sale_price AS receiver_sale_price,
--        sv.mrp AS sender_mrp, dv.mrp AS receiver_mrp, dv.stock_qty AS receiver_stock,
--        st.transfer_number AS last_transfer, st.accepted_at
-- FROM public.stock_transfer_items sti
-- JOIN public.stock_transfers st ON st.id = sti.transfer_id AND st.status = 'accepted'
-- JOIN public.product_variants sv ON sv.id = sti.from_variant_id AND sv.deleted_at IS NULL
-- JOIN public.product_variants dv ON dv.id = sti.to_variant_id AND dv.deleted_at IS NULL
-- JOIN public.organizations fo ON fo.id = st.from_organization_id
-- JOIN public.organizations tor ON tor.id = st.to_organization_id
-- WHERE COALESCE(sv.sale_price, 0) > 0 AND dv.sale_price IS DISTINCT FROM sv.sale_price
-- ORDER BY dv.id, st.accepted_at DESC;
