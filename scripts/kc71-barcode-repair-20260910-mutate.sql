-- =============================================================================
-- KS FOOTWEAR — PUR/26-27/207 KC71 barcode fork  PHASE 1 MUTATE
-- Tag: [kc71_barcode_repair_20260910]
-- Org: 4bc73037-e877-4123-9261-eb6e3876698c
--
-- Paste this ENTIRE script as one run in the SQL editor (needs BEGIN..COMMIT).
-- Soft-delete only. This bill / these five products only.
-- Do NOT run against the ~605 other 1xxxxxxxxx stocked SKUs.
--
-- Signed-off Phase 0 hand-check 10 Sep 2026:
--   line 23  0040011724  qty 3  sku 16bd823b… → f5ca4a2f…
--   empty shells 1000000690–0693  purchase=0 sale=0 movements=0 stock=0
-- =============================================================================

BEGIN;

DO $$
DECLARE
  v_org            uuid := '4bc73037-e877-4123-9261-eb6e3876698c';
  v_tag            text := '[kc71_barcode_repair_20260910]';
  v_item_id        uuid := '387f818e-f27d-40dd-8239-32b10625b30e';
  v_dup_sku        uuid := '16bd823b-fa45-42d6-88e8-decacc9dae37';
  v_dup_product    uuid := '19e6e93a-fee6-4b1a-b8f3-01375307eb7e';
  v_correct_sku    uuid := 'f5ca4a2f-d453-47c8-ac19-54dffba97590';
  v_correct_prod   uuid := 'aec276e7-a868-4e9e-a524-0aaeaccd9a84';
  v_bill_id        uuid;
  v_tx_start       timestamptz := now(); -- transaction clock; movement created_at defaults to now()
  v_moved          integer;
  v_tagged_mv      integer;
  v_soft_pv        integer;
  v_soft_p         integer;
  v_correct_qty    numeric;
  v_correct_legacy numeric;
  v_dup_qty        numeric;
  v_shell_ids      uuid[] := ARRAY[
    '66c4f1a1-d688-4592-b99f-2a8ea8dec11b'::uuid,
    'f141f9ab-194f-45e8-8330-cfc7be07c9e4'::uuid,
    'c57b386e-5098-431c-8313-47409fb2ee7b'::uuid,
    'ebafb84b-5304-47d5-b4eb-16e0e40b85cb'::uuid
  ];
  v_all_dup_sku    uuid[] := ARRAY[
    '16bd823b-fa45-42d6-88e8-decacc9dae37'::uuid,
    '66c4f1a1-d688-4592-b99f-2a8ea8dec11b'::uuid,
    'f141f9ab-194f-45e8-8330-cfc7be07c9e4'::uuid,
    'c57b386e-5098-431c-8313-47409fb2ee7b'::uuid,
    'ebafb84b-5304-47d5-b4eb-16e0e40b85cb'::uuid
  ];
  v_all_dup_prod   uuid[] := ARRAY[
    '19e6e93a-fee6-4b1a-b8f3-01375307eb7e'::uuid,
    '44a594b1-48d4-4c81-923a-f52ce0949700'::uuid,
    '54626ebf-bb30-4261-a48f-2ea4ce785aed'::uuid,
    '703c4b14-8094-40fa-ab06-d1e7b3780d9a'::uuid,
    '3b69da02-87dd-4492-8410-a3abd5f65e31'::uuid
  ];
  r record;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.organizations WHERE id = v_org) THEN
    RAISE EXCEPTION 'KS Footwear org not found';
  END IF;

  SELECT pb.id INTO v_bill_id
  FROM public.purchase_bills pb
  WHERE pb.organization_id = v_org
    AND pb.software_bill_no = 'PUR/26-27/207'
    AND pb.deleted_at IS NULL;
  IF v_bill_id IS NULL THEN
    RAISE EXCEPTION 'PUR/26-27/207 not found';
  END IF;

  -- Already applied?
  IF EXISTS (
    SELECT 1 FROM public.purchase_items
    WHERE id = v_item_id
      AND sku_id = v_correct_sku
      AND deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Already remapped (line 23 sku is already the correct variant). Abort.';
  END IF;

  SELECT pi.sku_id, pi.product_id, pi.barcode, pi.qty
  INTO r
  FROM public.purchase_items pi
  WHERE pi.id = v_item_id
    AND pi.bill_id = v_bill_id
    AND pi.deleted_at IS NULL;
  IF r.sku_id IS DISTINCT FROM v_dup_sku
     OR r.product_id IS DISTINCT FROM v_dup_product
     OR r.barcode IS DISTINCT FROM '0040011724'
     OR r.qty IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION
      'Line 23 not in signed-off state: sku=% product=% barcode=% qty=%',
      r.sku_id, r.product_id, r.barcode, r.qty;
  END IF;

  SELECT pv.barcode, pv.stock_qty, pv.deleted_at
  INTO r
  FROM public.product_variants pv
  WHERE pv.id = v_correct_sku AND pv.organization_id = v_org;
  IF r.barcode IS DISTINCT FROM '0040011724'
     OR r.stock_qty IS DISTINCT FROM 0
     OR r.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Correct variant not in signed-off state: barcode=% stock_qty=% deleted=%',
      r.barcode, r.stock_qty, r.deleted_at;
  END IF;

  SELECT pv.barcode, pv.stock_qty, pv.deleted_at
  INTO r
  FROM public.product_variants pv
  WHERE pv.id = v_dup_sku AND pv.organization_id = v_org;
  IF r.barcode IS DISTINCT FROM '1000000694'
     OR r.stock_qty IS DISTINCT FROM 3
     OR r.deleted_at IS NOT NULL THEN
    RAISE EXCEPTION 'Duplicate variant not in signed-off state: barcode=% stock_qty=% deleted=%',
      r.barcode, r.stock_qty, r.deleted_at;
  END IF;

  -- Empty shells still unused
  IF EXISTS (
    SELECT 1
    FROM public.product_variants pv
    WHERE pv.id = ANY (v_shell_ids)
      AND pv.organization_id = v_org
      AND (
        COALESCE(pv.stock_qty, 0) <> 0
        OR EXISTS (
          SELECT 1 FROM public.purchase_items pi
          JOIN public.purchase_bills pb ON pb.id = pi.bill_id
          WHERE pi.sku_id = pv.id AND pi.deleted_at IS NULL AND pb.deleted_at IS NULL
        )
        OR EXISTS (
          SELECT 1 FROM public.sale_items si
          JOIN public.sales s ON s.id = si.sale_id
          WHERE si.variant_id = pv.id AND si.deleted_at IS NULL AND s.deleted_at IS NULL
        )
      )
  ) THEN
    RAISE EXCEPTION 'Empty-shell preflight failed (stock or live bill/sale appeared)';
  END IF;

  -- 1) Remap the purchase line. handle_purchase_item_update writes
  --    purchase_sku_change_out/in and adjusts stock_qty. Do NOT replica-disable.
  UPDATE public.purchase_items
  SET sku_id = v_correct_sku,
      product_id = v_correct_prod,
      updated_at = now()
  WHERE id = v_item_id
    AND bill_id = v_bill_id
    AND sku_id = v_dup_sku
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_moved = ROW_COUNT;
  IF v_moved <> 1 THEN
    RAISE EXCEPTION 'Expected 1 purchase_item remap, got %', v_moved;
  END IF;

  -- 2) Tag the two trigger movements
  UPDATE public.stock_movements
  SET notes = trim(both from coalesce(notes, '') || E'\n' || v_tag)
  WHERE organization_id = v_org
    AND reference_id = v_bill_id
    AND variant_id IN (v_dup_sku, v_correct_sku)
    AND movement_type IN ('purchase_sku_change_out', 'purchase_sku_change_in')
    AND created_at >= v_tx_start
    AND coalesce(notes, '') NOT LIKE '%' || v_tag || '%';
  GET DIAGNOSTICS v_tagged_mv = ROW_COUNT;
  IF v_tagged_mv <> 2 THEN
    RAISE EXCEPTION 'Expected 2 tagged sku-change movements, got %', v_tagged_mv;
  END IF;

  -- 3) Legacy current_stock would be 6+3=9 on the correct SKU. Snap to stock_qty.
  UPDATE public.product_variants
  SET current_stock = stock_qty,
      updated_at = now()
  WHERE organization_id = v_org
    AND id IN (v_dup_sku, v_correct_sku);

  SELECT stock_qty, current_stock INTO v_correct_qty, v_correct_legacy
  FROM public.product_variants WHERE id = v_correct_sku;
  SELECT stock_qty INTO v_dup_qty
  FROM public.product_variants WHERE id = v_dup_sku;

  IF v_correct_qty IS DISTINCT FROM 3 OR v_correct_legacy IS DISTINCT FROM 3 THEN
    RAISE EXCEPTION 'Correct SKU after move: stock_qty=% current_stock=% (want 3/3)',
      v_correct_qty, v_correct_legacy;
  END IF;
  IF v_dup_qty IS DISTINCT FROM 0 THEN
    RAISE EXCEPTION 'Duplicate SKU after move still has stock_qty=%', v_dup_qty;
  END IF;

  -- 4) Queryable tag on empty shells (qty 0 — does not change stock_qty)
  INSERT INTO public.stock_movements (
    variant_id, movement_type, quantity, reference_id, bill_number,
    notes, organization_id, user_id
  )
  SELECT
    pv.id,
    'reconciliation',
    0,
    v_bill_id,
    'PUR/26-27/207',
    v_tag || ' empty KC71 size-42 shell; soft-delete next',
    v_org,
    NULL
  FROM public.product_variants pv
  WHERE pv.id = ANY (v_shell_ids)
    AND pv.organization_id = v_org
    AND pv.deleted_at IS NULL;

  -- 5) Soft-delete the five duplicate variants (must be empty) then products
  UPDATE public.product_variants
  SET deleted_at = now(),
      active = false,
      updated_at = now()
  WHERE organization_id = v_org
    AND id = ANY (v_all_dup_sku)
    AND deleted_at IS NULL
    AND COALESCE(stock_qty, 0) = 0;
  GET DIAGNOSTICS v_soft_pv = ROW_COUNT;
  IF v_soft_pv <> 5 THEN
    RAISE EXCEPTION 'Expected 5 variant soft-deletes, got %', v_soft_pv;
  END IF;

  UPDATE public.products
  SET deleted_at = now(),
      updated_at = now()
  WHERE organization_id = v_org
    AND id = ANY (v_all_dup_prod)
    AND deleted_at IS NULL;
  GET DIAGNOSTICS v_soft_p = ROW_COUNT;
  IF v_soft_p <> 5 THEN
    RAISE EXCEPTION 'Expected 5 product soft-deletes, got %', v_soft_p;
  END IF;

  -- 6) Tag the bill (purchase_items has no notes column)
  UPDATE public.purchase_bills
  SET notes = trim(both from coalesce(notes, '') || E'\n' || v_tag
    || ' remapped purchase_item 387f818e sku 16bd823b→f5ca4a2f barcode 0040011724 qty 3;'
    || ' soft-deleted products 19e6e93a,44a594b1,54626ebf,703c4b14,3b69da02'),
      updated_at = now()
  WHERE id = v_bill_id
    AND organization_id = v_org
    AND coalesce(notes, '') NOT LIKE '%' || v_tag || '%';

  -- 7) Do not have touched the 13:13 same-product generated siblings
  IF EXISTS (
    SELECT 1 FROM public.product_variants
    WHERE organization_id = v_org
      AND barcode IN ('1000000675','1000000676','1000000677','1000000678','1000000679')
      AND (deleted_at IS NOT NULL OR product_id IS DISTINCT FROM v_correct_prod)
  ) THEN
    RAISE EXCEPTION 'Out-of-scope 13:13 generated siblings on canonical KC71 were disturbed';
  END IF;

  RAISE NOTICE '% remapped 1 line, tagged % movements, soft-deleted % variants / % products',
    v_tag, v_tagged_mv, v_soft_pv, v_soft_p;
END $$;

-- Visible after-state (still inside the transaction)
SELECT
  pi.id AS purchase_item_id,
  pi.line_number,
  pi.barcode AS displayed_barcode,
  pi.sku_id,
  pi.product_id,
  pv.barcode AS live_barcode,
  pv.stock_qty,
  pv.current_stock AS legacy_current_stock
FROM public.purchase_items pi
JOIN public.product_variants pv ON pv.id = pi.sku_id
WHERE pi.id = '387f818e-f27d-40dd-8239-32b10625b30e';

SELECT id, barcode, stock_qty, current_stock, deleted_at, active
FROM public.product_variants
WHERE id IN (
  'f5ca4a2f-d453-47c8-ac19-54dffba97590',
  '16bd823b-fa45-42d6-88e8-decacc9dae37'
)
ORDER BY barcode;

SELECT p.id, p.product_name, p.deleted_at, pv.barcode, pv.stock_qty, pv.deleted_at AS variant_deleted_at
FROM public.products p
JOIN public.product_variants pv ON pv.product_id = p.id
WHERE p.id IN (
  '19e6e93a-fee6-4b1a-b8f3-01375307eb7e',
  '44a594b1-48d4-4c81-923a-f52ce0949700',
  '54626ebf-bb30-4261-a48f-2ea4ce785aed',
  '703c4b14-8094-40fa-ab06-d1e7b3780d9a',
  '3b69da02-87dd-4492-8410-a3abd5f65e31'
)
ORDER BY pv.barcode;

COMMIT;
