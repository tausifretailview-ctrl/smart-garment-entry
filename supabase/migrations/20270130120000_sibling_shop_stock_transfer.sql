-- Stock transfer between sibling shops (separate organizations whose owner is
-- admin in both). One-step: on save, stock leaves the source shop and lands in
-- the destination shop in the same transaction. A destination product that does
-- not exist yet is created with the same barcode, name, size, colour, GST and
-- prices (a destination product with the same name gets the new size/colour as a
-- variant, since product names are unique per shop). Lines are valued at the source variant purchase price.
--
-- Stock recompute (Stock Reconciliation, Reset stock, per-variant reconcile) now
-- counts transfers: opening + purchases - sales - purchase returns + sale returns
-- - pending DC + transfers in - transfers out.

-- 1. Tables ------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS public.stock_transfers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_number text NOT NULL,
  from_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  to_organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transfer_date timestamptz NOT NULL DEFAULT now(),
  total_qty numeric NOT NULL DEFAULT 0,
  total_value numeric NOT NULL DEFAULT 0,
  notes text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  cancelled_at timestamptz,
  cancelled_by uuid,
  CONSTRAINT stock_transfers_distinct_orgs CHECK (from_organization_id <> to_organization_id)
);

CREATE UNIQUE INDEX IF NOT EXISTS stock_transfers_from_org_number_key
  ON public.stock_transfers (from_organization_id, transfer_number);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_from_org_date
  ON public.stock_transfers (from_organization_id, transfer_date DESC);
CREATE INDEX IF NOT EXISTS idx_stock_transfers_to_org_date
  ON public.stock_transfers (to_organization_id, transfer_date DESC);

CREATE TABLE IF NOT EXISTS public.stock_transfer_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  transfer_id uuid NOT NULL REFERENCES public.stock_transfers(id) ON DELETE CASCADE,
  from_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  to_variant_id uuid NOT NULL REFERENCES public.product_variants(id),
  product_name text,
  barcode text,
  size text,
  color text,
  qty numeric NOT NULL CHECK (qty > 0),
  unit_cost numeric NOT NULL DEFAULT 0,
  line_value numeric NOT NULL DEFAULT 0,
  created_in_destination boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_transfer
  ON public.stock_transfer_items (transfer_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_from_variant
  ON public.stock_transfer_items (from_variant_id);
CREATE INDEX IF NOT EXISTS idx_stock_transfer_items_to_variant
  ON public.stock_transfer_items (to_variant_id);

ALTER TABLE public.stock_transfers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.stock_transfer_items ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Members of either shop can view transfers" ON public.stock_transfers;
CREATE POLICY "Members of either shop can view transfers"
  ON public.stock_transfers FOR SELECT TO authenticated
  USING (
    from_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    OR to_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
  );

DROP POLICY IF EXISTS "Members of either shop can view transfer items" ON public.stock_transfer_items;
CREATE POLICY "Members of either shop can view transfer items"
  ON public.stock_transfer_items FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.stock_transfers t
      WHERE t.id = stock_transfer_items.transfer_id
        AND (
          t.from_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
          OR t.to_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
        )
    )
  );

REVOKE INSERT, UPDATE, DELETE ON public.stock_transfers FROM anon, authenticated;
REVOKE INSERT, UPDATE, DELETE ON public.stock_transfer_items FROM anon, authenticated;
GRANT SELECT ON public.stock_transfers TO authenticated;
GRANT SELECT ON public.stock_transfer_items TO authenticated;

-- 2. Net transfer qty per variant (in - out), live transfers only --------------

CREATE OR REPLACE FUNCTION public._stock_transfer_net_for_variant(p_variant_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    COALESCE((
      SELECT SUM(ti.qty) FROM public.stock_transfer_items ti
      JOIN public.stock_transfers t ON t.id = ti.transfer_id
      WHERE ti.to_variant_id = p_variant_id AND t.cancelled_at IS NULL
    ), 0)
    - COALESCE((
      SELECT SUM(ti.qty) FROM public.stock_transfer_items ti
      JOIN public.stock_transfers t ON t.id = ti.transfer_id
      WHERE ti.from_variant_id = p_variant_id AND t.cancelled_at IS NULL
    ), 0);
$$;

REVOKE ALL ON FUNCTION public._stock_transfer_net_for_variant(uuid) FROM PUBLIC, anon, authenticated;

-- 3. Sibling shops: other shops where the caller is admin, while also admin here

CREATE OR REPLACE FUNCTION public.get_sibling_shops(p_organization_id uuid)
RETURNS TABLE (id uuid, name text, slug text)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT o.id, o.name, o.slug
  FROM public.organization_members m
  JOIN public.organizations o ON o.id = m.organization_id
  WHERE m.user_id = auth.uid()
    AND m.role = 'admin'
    AND o.id <> p_organization_id
    AND COALESCE(o.is_suspended, false) = false
    AND public.is_org_admin(auth.uid(), p_organization_id)
  ORDER BY o.name;
$$;

REVOKE ALL ON FUNCTION public.get_sibling_shops(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_sibling_shops(uuid) TO authenticated;

-- 4. Create a transfer ---------------------------------------------------------
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
  v_dest_variant_id uuid;
  v_dest_product_id uuid;
  v_dest_size_group uuid;
  v_created boolean;
  v_remaining numeric;
  v_batch record;
  v_take numeric;
  v_total_qty numeric := 0;
  v_total_value numeric := 0;
  v_created_count integer := 0;
  v_from_name text;
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

  SELECT name INTO v_from_name FROM organizations WHERE id = p_from_organization_id;
  SELECT name INTO v_to_name FROM organizations WHERE id = p_to_organization_id;

  PERFORM pg_advisory_xact_lock(hashtext('stock_transfer_number_' || p_from_organization_id::text));
  SELECT COALESCE(MAX(NULLIF(regexp_replace(transfer_number, '\D', '', 'g'), '')::integer), 0) + 1
    INTO v_seq
    FROM stock_transfers
    WHERE from_organization_id = p_from_organization_id;
  v_number := 'ST/' || lpad(v_seq::text, 4, '0');

  INSERT INTO stock_transfers (transfer_number, from_organization_id, to_organization_id, notes, created_by)
  VALUES (v_number, p_from_organization_id, p_to_organization_id, NULLIF(trim(COALESCE(p_notes, '')), ''), v_uid)
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

    v_dest_variant_id := NULL;
    v_created := false;

    IF NULLIF(trim(COALESCE(v_src.barcode, '')), '') IS NOT NULL THEN
      SELECT pv.id INTO v_dest_variant_id
      FROM product_variants pv
      JOIN products p ON p.id = pv.product_id
      WHERE pv.organization_id = p_to_organization_id
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
      WHERE p.organization_id = p_to_organization_id
        AND p.deleted_at IS NULL
        AND lower(trim(p.product_name)) = lower(trim(v_src_product.product_name))
      LIMIT 1;

      IF v_dest_product_id IS NULL THEN
        v_dest_size_group := NULL;
        IF v_src_product.size_group_id IS NOT NULL THEN
          SELECT dg.id INTO v_dest_size_group
          FROM size_groups sg
          JOIN size_groups dg
            ON dg.organization_id = p_to_organization_id
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
          p_to_organization_id, v_src_product.product_name, v_src_product.brand, v_src_product.category,
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
        p_to_organization_id, v_dest_product_id, v_src.barcode, COALESCE(v_src.barcode_source, 'generated'),
        COALESCE(v_src.size, ''), v_src.color,
        v_src.mrp, v_src.pur_price, v_src.sale_price, 0, 0, true
      )
      RETURNING id INTO v_dest_variant_id;
      v_created := true;
      v_created_count := v_created_count + 1;
    END IF;

    PERFORM 1 FROM product_variants WHERE id = v_dest_variant_id FOR UPDATE;

    UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) - v_item.qty, updated_at = now()
      WHERE id = v_src.id;
    UPDATE product_variants
      SET stock_qty = COALESCE(stock_qty, 0) + v_item.qty, updated_at = now()
      WHERE id = v_dest_variant_id;

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

    INSERT INTO batch_stock (variant_id, organization_id, bill_number, purchase_date, quantity)
    VALUES (v_dest_variant_id, p_to_organization_id, v_number, now(), v_item.qty);

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, bill_number, notes, user_id)
    VALUES
      (v_src.id, p_from_organization_id, 'transfer_out', -v_item.qty, v_transfer_id, v_number,
       'Stock transfer to ' || COALESCE(v_to_name, 'other shop'), v_uid),
      (v_dest_variant_id, p_to_organization_id, 'transfer_in', v_item.qty, v_transfer_id, v_number,
       'Stock transfer from ' || COALESCE(v_from_name, 'other shop'), v_uid);

    INSERT INTO stock_transfer_items (
      transfer_id, from_variant_id, to_variant_id, product_name, barcode, size, color,
      qty, unit_cost, line_value, created_in_destination
    ) VALUES (
      v_transfer_id, v_src.id, v_dest_variant_id, v_src_product.product_name, v_src.barcode,
      v_src.size, v_src.color, v_item.qty, COALESCE(v_src.pur_price, 0),
      round(v_item.qty * COALESCE(v_src.pur_price, 0), 2), v_created
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
    'created_products', v_created_count
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_stock_transfer(uuid, uuid, jsonb, text) TO authenticated;

-- 5. Cancel a transfer (stock goes back; needs the stock still in the destination)

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
  IF v_uid IS NULL
     OR NOT public.is_org_admin(v_uid, v_t.from_organization_id)
     OR NOT public.is_org_admin(v_uid, v_t.to_organization_id) THEN
    RAISE EXCEPTION 'Only an admin of both shops can cancel a transfer' USING ERRCODE = '42501';
  END IF;
  IF v_t.cancelled_at IS NOT NULL THEN
    RAISE EXCEPTION 'Transfer % is already cancelled', v_t.transfer_number;
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

  UPDATE stock_transfers SET cancelled_at = now(), cancelled_by = v_uid WHERE id = p_transfer_id;

  RETURN jsonb_build_object('transfer_id', p_transfer_id, 'cancelled', true);
END;
$$;

REVOKE ALL ON FUNCTION public.cancel_stock_transfer(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.cancel_stock_transfer(uuid) TO authenticated;

-- 6. Stock recompute counts transfers -----------------------------------------
-- Same signatures and output columns as before; only the recomputed qty changes.

CREATE OR REPLACE FUNCTION public._get_stock_reconciliation_rows(p_organization_id uuid)
RETURNS TABLE (
  out_variant_id uuid,
  out_barcode text,
  out_product_name text,
  out_size text,
  out_color text,
  out_stored_stock_qty numeric,
  out_opening_qty numeric,
  out_purchases numeric,
  out_sales numeric,
  out_purchase_returns numeric,
  out_sale_returns numeric,
  out_pending_dc numeric,
  out_recomputed_stock_qty numeric,
  out_drift numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH
  purchased AS (
    SELECT
      pi.sku_id AS variant_id,
      COALESCE(SUM(pi.qty), 0)::numeric AS qty
    FROM public.purchase_items pi
    INNER JOIN public.purchase_bills pb ON pb.id = pi.bill_id
    WHERE pb.organization_id = p_organization_id
      AND pi.deleted_at IS NULL
      AND pb.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  sold AS (
    SELECT
      si.variant_id,
      COALESCE(SUM(si.quantity), 0)::numeric AS qty
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = p_organization_id
      AND si.deleted_at IS NULL
      AND s.deleted_at IS NULL
      AND si.variant_id IS NOT NULL
    GROUP BY si.variant_id
  ),
  purchase_returned AS (
    SELECT
      pri.sku_id AS variant_id,
      COALESCE(SUM(pri.qty), 0)::numeric AS qty
    FROM public.purchase_return_items pri
    INNER JOIN public.purchase_returns pr ON pr.id = pri.return_id
    WHERE pr.organization_id = p_organization_id
      AND pri.deleted_at IS NULL
      AND pr.deleted_at IS NULL
      AND pri.sku_id IS NOT NULL
    GROUP BY pri.sku_id
  ),
  sale_returned AS (
    SELECT
      sri.variant_id,
      COALESCE(SUM(sri.quantity), 0)::numeric AS qty
    FROM public.sale_return_items sri
    INNER JOIN public.sale_returns sr ON sr.id = sri.return_id
    WHERE sr.organization_id = p_organization_id
      AND sri.deleted_at IS NULL
      AND sr.deleted_at IS NULL
      AND sri.variant_id IS NOT NULL
    GROUP BY sri.variant_id
  ),
  pending_challan AS (
    SELECT
      dci.variant_id,
      COALESCE(SUM(dci.quantity), 0)::numeric AS qty
    FROM public.delivery_challan_items dci
    INNER JOIN public.delivery_challans dc ON dc.id = dci.challan_id
    WHERE dc.organization_id = p_organization_id
      AND dci.deleted_at IS NULL
      AND dc.deleted_at IS NULL
      AND dc.converted_to_invoice_id IS NULL
      AND dc.status IS DISTINCT FROM 'cancelled'
      AND dci.variant_id IS NOT NULL
    GROUP BY dci.variant_id
  ),
  transferred AS (
    SELECT x.variant_id, SUM(x.qty)::numeric AS qty
    FROM (
      SELECT ti.to_variant_id AS variant_id, ti.qty
      FROM public.stock_transfer_items ti
      INNER JOIN public.stock_transfers t ON t.id = ti.transfer_id
      WHERE t.to_organization_id = p_organization_id AND t.cancelled_at IS NULL
      UNION ALL
      SELECT ti.from_variant_id, -ti.qty
      FROM public.stock_transfer_items ti
      INNER JOIN public.stock_transfers t ON t.id = ti.transfer_id
      WHERE t.from_organization_id = p_organization_id AND t.cancelled_at IS NULL
    ) x
    GROUP BY x.variant_id
  ),
  variants AS (
    SELECT
      pv.id,
      pv.barcode,
      pv.size,
      pv.color,
      COALESCE(pv.stock_qty, 0)::numeric AS stock_qty,
      COALESCE(pv.opening_qty, 0)::numeric AS opening_qty,
      p.product_name
    FROM public.product_variants pv
    INNER JOIN public.products p ON p.id = pv.product_id
    WHERE pv.organization_id = p_organization_id
      AND pv.deleted_at IS NULL
      AND p.deleted_at IS NULL
      AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
  )
  SELECT
    v.id,
    v.barcode,
    v.product_name,
    v.size,
    v.color,
    v.stock_qty,
    v.opening_qty,
    COALESCE(pu.qty, 0),
    COALESCE(so.qty, 0),
    COALESCE(pr.qty, 0),
    COALESCE(sr.qty, 0),
    COALESCE(pc.qty, 0),
    (
      v.opening_qty
      + COALESCE(pu.qty, 0)
      - COALESCE(so.qty, 0)
      - COALESCE(pr.qty, 0)
      + COALESCE(sr.qty, 0)
      - COALESCE(pc.qty, 0)
      + COALESCE(tr.qty, 0)
    ),
    (
      v.stock_qty
      - (
        v.opening_qty
        + COALESCE(pu.qty, 0)
        - COALESCE(so.qty, 0)
        - COALESCE(pr.qty, 0)
        + COALESCE(sr.qty, 0)
        - COALESCE(pc.qty, 0)
        + COALESCE(tr.qty, 0)
      )
    )
  FROM variants v
  LEFT JOIN purchased pu ON pu.variant_id = v.id
  LEFT JOIN sold so ON so.variant_id = v.id
  LEFT JOIN purchase_returned pr ON pr.variant_id = v.id
  LEFT JOIN sale_returned sr ON sr.variant_id = v.id
  LEFT JOIN pending_challan pc ON pc.variant_id = v.id
  LEFT JOIN transferred tr ON tr.variant_id = v.id;
$$;

CREATE OR REPLACE FUNCTION public.reset_stock_from_transactions(p_organization_id uuid)
RETURNS TABLE(fixed_count integer, details jsonb)
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_fixed_count integer := 0;
  v_details jsonb := '[]'::jsonb;
  v_record RECORD;
BEGIN
  FOR v_record IN
    WITH variant_transactions AS (
      SELECT pv.id as variant_id, pv.barcode, p.product_name, pv.size,
        pv.stock_qty as current_stock_qty, COALESCE(pv.opening_qty, 0) as opening_qty,
        COALESCE((SELECT SUM(pi.qty) FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id WHERE pi.sku_id = pv.id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL), 0) as purchase_qty,
        COALESCE((SELECT SUM(si.quantity) FROM sale_items si JOIN sales s ON s.id = si.sale_id WHERE si.variant_id = pv.id AND si.deleted_at IS NULL AND s.deleted_at IS NULL), 0) as sale_qty,
        COALESCE((SELECT SUM(pri.qty) FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id WHERE pri.sku_id = pv.id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL), 0) as purchase_return_qty,
        COALESCE((SELECT SUM(sri.quantity) FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.return_id WHERE sri.variant_id = pv.id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL), 0) as sale_return_qty,
        COALESCE((SELECT SUM(dci.quantity) FROM delivery_challan_items dci JOIN delivery_challans dc ON dc.id = dci.challan_id WHERE dci.variant_id = pv.id AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL AND dc.converted_to_invoice_id IS NULL AND dc.status != 'cancelled'), 0) as pending_challan_qty,
        public._stock_transfer_net_for_variant(pv.id) as transfer_net_qty
      FROM product_variants pv JOIN products p ON p.id = pv.product_id
      WHERE pv.organization_id = p_organization_id AND pv.deleted_at IS NULL
        AND COALESCE(p.product_type, 'goods') NOT IN ('service', 'combo')
    )
    SELECT vt.*, (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty - vt.pending_challan_qty + vt.transfer_net_qty) as calculated_stock
    FROM variant_transactions vt
    WHERE vt.current_stock_qty != (vt.opening_qty + vt.purchase_qty - vt.sale_qty - vt.purchase_return_qty + vt.sale_return_qty - vt.pending_challan_qty + vt.transfer_net_qty)
  LOOP
    UPDATE product_variants SET stock_qty = v_record.calculated_stock, updated_at = NOW() WHERE id = v_record.variant_id;

    INSERT INTO stock_movements (variant_id, movement_type, quantity, notes, organization_id, user_id)
    VALUES (v_record.variant_id, 'stock_reset', 0,
      'Stock reset: opening=' || v_record.opening_qty || ', purchases=' || v_record.purchase_qty || ', sales=' || v_record.sale_qty || ', pur_returns=' || v_record.purchase_return_qty || ', sale_returns=' || v_record.sale_return_qty || ', pending_dc=' || v_record.pending_challan_qty || ', transfers=' || v_record.transfer_net_qty || ' | old=' || v_record.current_stock_qty || ', new=' || v_record.calculated_stock,
      p_organization_id, auth.uid());

    v_fixed_count := v_fixed_count + 1;
    v_details := v_details || jsonb_build_object(
      'barcode', v_record.barcode, 'product_name', v_record.product_name, 'size', v_record.size,
      'old_qty', v_record.current_stock_qty, 'new_qty', v_record.calculated_stock,
      'opening', v_record.opening_qty, 'purchases', v_record.purchase_qty, 'sales', v_record.sale_qty,
      'pur_returns', v_record.purchase_return_qty, 'sale_returns', v_record.sale_return_qty,
      'transfers', v_record.transfer_net_qty
    );
  END LOOP;

  RETURN QUERY SELECT v_fixed_count, v_details;
END;
$$;

CREATE OR REPLACE FUNCTION public.reconcile_variant_stock_qty(p_variant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_org_id uuid;
  v_opening numeric;
  v_current numeric;
  v_product_type text;
  v_purchases numeric;
  v_sales numeric;
  v_pur_returns numeric;
  v_sale_returns numeric;
  v_pending_dc numeric;
  v_transfers numeric;
  v_calculated numeric;
BEGIN
  SELECT pv.organization_id, COALESCE(pv.opening_qty, 0), COALESCE(pv.stock_qty, 0), COALESCE(p.product_type, 'goods')
  INTO v_org_id, v_opening, v_current, v_product_type
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE pv.id = p_variant_id;

  IF v_org_id IS NULL THEN
    RETURN jsonb_build_object('error', 'Variant not found');
  END IF;

  IF v_product_type IN ('service', 'combo') THEN
    RETURN jsonb_build_object('variant_id', p_variant_id, 'old_stock', v_current, 'new_stock', v_current, 'corrected', false, 'skipped', true, 'reason', 'Service/combo products do not track stock');
  END IF;

  SELECT COALESCE(SUM(pi.qty), 0) INTO v_purchases
  FROM purchase_items pi JOIN purchase_bills pb ON pb.id = pi.bill_id
  WHERE pi.sku_id = p_variant_id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL;

  SELECT COALESCE(SUM(si.quantity), 0) INTO v_sales
  FROM sale_items si JOIN sales s ON s.id = si.sale_id
  WHERE si.variant_id = p_variant_id AND si.deleted_at IS NULL AND s.deleted_at IS NULL;

  SELECT COALESCE(SUM(pri.qty), 0) INTO v_pur_returns
  FROM purchase_return_items pri JOIN purchase_returns pr ON pr.id = pri.return_id
  WHERE pri.sku_id = p_variant_id AND pri.deleted_at IS NULL AND pr.deleted_at IS NULL;

  SELECT COALESCE(SUM(sri.quantity), 0) INTO v_sale_returns
  FROM sale_return_items sri JOIN sale_returns sr ON sr.id = sri.return_id
  WHERE sri.variant_id = p_variant_id AND sri.deleted_at IS NULL AND sr.deleted_at IS NULL;

  SELECT COALESCE(SUM(dci.quantity), 0) INTO v_pending_dc
  FROM delivery_challan_items dci JOIN delivery_challans dc ON dc.id = dci.challan_id
  WHERE dci.variant_id = p_variant_id AND dci.deleted_at IS NULL AND dc.deleted_at IS NULL
    AND dc.converted_to_invoice_id IS NULL AND dc.status != 'cancelled';

  v_transfers := public._stock_transfer_net_for_variant(p_variant_id);

  v_calculated := v_opening + v_purchases - v_sales - v_pur_returns + v_sale_returns - v_pending_dc + v_transfers;

  IF v_calculated != v_current THEN
    UPDATE product_variants SET stock_qty = v_calculated, updated_at = now()
    WHERE id = p_variant_id;

    INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, reference_id, notes)
    VALUES (p_variant_id, v_org_id, 'reconciliation', v_calculated - v_current, p_variant_id,
      'Auto-reconciliation: opening=' || v_opening || ', purchases=' || v_purchases || ', sales=' || v_sales || ', pur_ret=' || v_pur_returns || ', sale_ret=' || v_sale_returns || ', pending_dc=' || v_pending_dc || ', transfers=' || v_transfers || ' | corrected ' || v_current || ' → ' || v_calculated);
  END IF;

  RETURN jsonb_build_object(
    'variant_id', p_variant_id,
    'old_stock', v_current,
    'new_stock', v_calculated,
    'corrected', v_calculated != v_current
  );
END;
$$;

NOTIFY pgrst, 'reload schema';
