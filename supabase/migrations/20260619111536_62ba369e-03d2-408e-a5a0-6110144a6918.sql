-- Per-sku delta backfill for purchase bills since 2026-06-18.
-- The earlier backfill (20260619104518) skipped bills if ANY stock_movement of type='purchase'
-- existed for that bill. For bills where the initial atomic save left items without movements
-- but a later edit-mode insert created movements for OTHER items, the original items remained
-- unbackfilled. This pass compares per-sku qty in purchase_items vs per-sku qty in
-- stock_movements and applies only the missing delta.
DO $$
DECLARE
  r record;
  v_bill_number text;
  v_purchase_date timestamptz;
  v_org_id uuid;
BEGIN
  FOR r IN
    WITH items AS (
      SELECT pi.bill_id, pi.sku_id, SUM(pi.qty) AS qty
      FROM public.purchase_items pi
      JOIN public.purchase_bills pb ON pb.id = pi.bill_id
      WHERE pb.created_at >= '2026-06-18'
        AND pb.deleted_at IS NULL
        AND COALESCE(pb.is_cancelled, false) = false
        AND pi.deleted_at IS NULL
        AND pi.sku_id IS NOT NULL
      GROUP BY pi.bill_id, pi.sku_id
    ),
    mov AS (
      SELECT sm.reference_id AS bill_id, sm.variant_id AS sku_id,
             SUM(sm.quantity) AS qty
      FROM public.stock_movements sm
      WHERE sm.movement_type = 'purchase'
      GROUP BY sm.reference_id, sm.variant_id
    )
    SELECT items.bill_id, items.sku_id,
           (items.qty - COALESCE(mov.qty, 0))::numeric AS delta
    FROM items
    LEFT JOIN mov ON mov.bill_id = items.bill_id AND mov.sku_id = items.sku_id
    WHERE items.qty - COALESCE(mov.qty, 0) > 0
  LOOP
    SELECT pb.software_bill_no, pb.bill_date, pb.organization_id
    INTO v_bill_number, v_purchase_date, v_org_id
    FROM public.purchase_bills pb WHERE pb.id = r.bill_id;

    UPDATE public.product_variants
    SET stock_qty = stock_qty + r.delta::integer, updated_at = NOW()
    WHERE id = r.sku_id;

    INSERT INTO public.batch_stock (
      variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id
    ) VALUES (
      r.sku_id, v_bill_number, r.delta::integer, r.bill_id, v_purchase_date, v_org_id
    )
    ON CONFLICT (variant_id, bill_number)
    DO UPDATE SET quantity = public.batch_stock.quantity + EXCLUDED.quantity,
                  updated_at = NOW();

    INSERT INTO public.stock_movements (
      variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id
    ) VALUES (
      r.sku_id, 'purchase', r.delta, r.bill_id, v_bill_number,
      'Backfill: missing stock from purchase bill ' || COALESCE(v_bill_number, r.bill_id::text),
      v_org_id, NULL
    );
  END LOOP;
END$$;

-- Refresh total_qty on affected bills so dashboards reflect the corrected stock.
UPDATE public.purchase_bills pb
SET total_qty = sub.total_qty
FROM (
  SELECT pi.bill_id, COALESCE(SUM(pi.qty), 0)::integer AS total_qty
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
  GROUP BY pi.bill_id
) sub
WHERE pb.id = sub.bill_id
  AND pb.created_at >= '2026-06-18';

-- Make the bulk apply helper safe to re-run: only insert movements / stock for the
-- per-sku qty that is still missing. This prevents the original full-rewrite from
-- ever double-applying if it gets called again after an edit. Going forward,
-- save_purchase_bill_with_items_atomic is the only caller and runs once per save,
-- but defensive idempotency removes a whole class of regressions.
CREATE OR REPLACE FUNCTION public._apply_bulk_purchase_insert_effects(p_bill_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_purchase_date timestamptz;
  v_bill_number text;
  v_org_id uuid;
  v_missing_variants integer;
BEGIN
  SELECT bill_date, software_bill_no, organization_id
  INTO v_purchase_date, v_bill_number, v_org_id
  FROM public.purchase_bills
  WHERE id = p_bill_id;

  IF v_org_id IS NULL THEN
    RAISE EXCEPTION 'Purchase bill % not found for bulk insert effects', p_bill_id;
  END IF;

  UPDATE public.purchase_bills
  SET total_qty = (
    SELECT COALESCE(SUM(pi.qty), 0)::integer
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
  )
  WHERE id = p_bill_id;

  WITH agg AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  )
  SELECT COUNT(*)::integer
  INTO v_missing_variants
  FROM agg
  WHERE NOT EXISTS (
    SELECT 1 FROM public.product_variants pv WHERE pv.id = agg.sku_id
  );

  IF v_missing_variants > 0 THEN
    RAISE EXCEPTION 'Cannot add purchase stock: % variant(s) not found', v_missing_variants;
  END IF;

  -- Per-sku delta = items_qty - already_recorded_movement_qty.
  WITH items AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  mov AS (
    SELECT sm.variant_id AS sku_id, SUM(sm.quantity) AS qty
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_bill_id
      AND sm.movement_type = 'purchase'
    GROUP BY sm.variant_id
  ),
  delta AS (
    SELECT items.sku_id, (items.qty - COALESCE(mov.qty, 0)) AS qty
    FROM items
    LEFT JOIN mov ON mov.sku_id = items.sku_id
    WHERE items.qty - COALESCE(mov.qty, 0) > 0
  )
  UPDATE public.product_variants pv
  SET stock_qty = pv.stock_qty + delta.qty::integer,
      updated_at = NOW()
  FROM delta
  WHERE pv.id = delta.sku_id;

  WITH items AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  mov AS (
    SELECT sm.variant_id AS sku_id, SUM(sm.quantity) AS qty
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_bill_id
      AND sm.movement_type = 'purchase'
    GROUP BY sm.variant_id
  ),
  delta AS (
    SELECT items.sku_id, (items.qty - COALESCE(mov.qty, 0)) AS qty
    FROM items
    LEFT JOIN mov ON mov.sku_id = items.sku_id
    WHERE items.qty - COALESCE(mov.qty, 0) > 0
  )
  INSERT INTO public.batch_stock (
    variant_id, bill_number, quantity, purchase_bill_id, purchase_date, organization_id
  )
  SELECT delta.sku_id, v_bill_number, delta.qty::integer, p_bill_id, v_purchase_date, v_org_id
  FROM delta
  ON CONFLICT (variant_id, bill_number)
  DO UPDATE SET quantity = public.batch_stock.quantity + EXCLUDED.quantity,
                updated_at = NOW();

  WITH items AS (
    SELECT pi.sku_id, SUM(pi.qty) AS qty
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    GROUP BY pi.sku_id
  ),
  mov AS (
    SELECT sm.variant_id AS sku_id, SUM(sm.quantity) AS qty
    FROM public.stock_movements sm
    WHERE sm.reference_id = p_bill_id
      AND sm.movement_type = 'purchase'
    GROUP BY sm.variant_id
  ),
  delta AS (
    SELECT items.sku_id, (items.qty - COALESCE(mov.qty, 0)) AS qty
    FROM items
    LEFT JOIN mov ON mov.sku_id = items.sku_id
    WHERE items.qty - COALESCE(mov.qty, 0) > 0
  )
  INSERT INTO public.stock_movements (
    variant_id, movement_type, quantity, reference_id, bill_number, notes, organization_id, user_id
  )
  SELECT delta.sku_id, 'purchase', delta.qty, p_bill_id, v_bill_number,
         'Stock added from purchase bill ' || v_bill_number, v_org_id, auth.uid()
  FROM delta;

  -- Refresh last_purchase_* metadata to the most recent line in this bill.
  UPDATE public.product_variants pv
  SET
    last_purchase_pur_price = latest.pur_price,
    last_purchase_sale_price = latest.sale_price,
    last_purchase_mrp = latest.mrp,
    last_purchase_date = NOW(),
    updated_at = NOW()
  FROM (
    SELECT DISTINCT ON (pi.sku_id)
      pi.sku_id, pi.pur_price, pi.sale_price, pi.mrp
    FROM public.purchase_items pi
    WHERE pi.bill_id = p_bill_id
      AND pi.deleted_at IS NULL
      AND pi.sku_id IS NOT NULL
    ORDER BY pi.sku_id, pi.ctid DESC
  ) AS latest
  WHERE pv.id = latest.sku_id;
END;
$function$;

COMMENT ON FUNCTION public._apply_bulk_purchase_insert_effects(uuid) IS
  'Applies stock_qty, batch_stock, and stock_movements for a purchase bill. Idempotent: only inserts the per-sku qty delta that is not yet recorded in stock_movements. Safe to re-run for backfills and double-saves. Required guardrail: save_purchase_bill_with_items_atomic asserts SUM(stock_movements.quantity)=SUM(purchase_items.qty) for the bill before commit.';