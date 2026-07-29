DO $$
DECLARE
  v_org UUID := 'c2bd3701-8f43-467e-a9c5-e21a608c5f3b';
  v_cutoff DATE := '2026-07-27';
  v_total_after NUMERIC;
  v_active_bills INT;
  v_scanned_total NUMERIC;
BEGIN
  -- 1. Snapshot dummy-bill IDs
  CREATE TEMP TABLE _dummy_sales ON COMMIT DROP AS
  SELECT id FROM sales
  WHERE organization_id = v_org
    AND sale_date >= v_cutoff
    AND deleted_at IS NULL;

  -- 2. Aggregate scanned qty per variant from the 45 bills
  CREATE TEMP TABLE _scanned ON COMMIT DROP AS
  SELECT si.variant_id, SUM(si.quantity)::NUMERIC AS qty
  FROM sale_items si
  WHERE si.sale_id IN (SELECT id FROM _dummy_sales)
    AND si.deleted_at IS NULL
    AND si.variant_id IS NOT NULL
  GROUP BY si.variant_id;

  SELECT COALESCE(SUM(qty),0) INTO v_scanned_total FROM _scanned;
  RAISE NOTICE 'Scanned total = %', v_scanned_total;

  -- 3. Audit: zero-out phantom stock movement for every variant currently > 0
  INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, notes, user_id)
  SELECT pv.id, v_org, 'reconciliation', -pv.stock_qty,
         'Physical count reconciliation 27-Jul-2026 — zero phantom stock (was ' || pv.stock_qty || ')',
         NULL
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE p.organization_id = v_org AND pv.stock_qty <> 0;

  -- 4. Audit: restore scanned qty for the variants physically counted
  INSERT INTO stock_movements (variant_id, organization_id, movement_type, quantity, notes, user_id)
  SELECT s.variant_id, v_org, 'reconciliation', s.qty,
         'Physical count reconciliation 27-Jul-2026 — restore scanned qty ' || s.qty,
         NULL
  FROM _scanned s;

  -- 5. Reset stock_qty: 0 for everything, then set scanned qty
  UPDATE product_variants pv
  SET stock_qty = 0, updated_at = now()
  FROM products p
  WHERE pv.product_id = p.id
    AND p.organization_id = v_org
    AND pv.stock_qty <> 0;

  UPDATE product_variants pv
  SET stock_qty = s.qty, updated_at = now()
  FROM _scanned s
  WHERE pv.id = s.variant_id;

  -- 6. Soft-delete sale_items (skip trigger reversal because we handled stock manually above)
  UPDATE sale_items
  SET deleted_at = now()
  WHERE sale_id IN (SELECT id FROM _dummy_sales)
    AND deleted_at IS NULL;

  -- 7. Soft-delete sales (mark cancelled, keep in Recycle Bin)
  UPDATE sales
  SET deleted_at = now(),
      is_cancelled = true,
      updated_at = now()
  WHERE id IN (SELECT id FROM _dummy_sales);

  -- 8. Verify
  SELECT COALESCE(SUM(pv.stock_qty),0) INTO v_total_after
  FROM product_variants pv
  JOIN products p ON p.id = pv.product_id
  WHERE p.organization_id = v_org;

  SELECT COUNT(*) INTO v_active_bills
  FROM sales
  WHERE organization_id = v_org AND sale_date >= v_cutoff AND deleted_at IS NULL;

  RAISE NOTICE 'Total stock after = %, active bills since cutoff = %', v_total_after, v_active_bills;

  IF v_total_after <> v_scanned_total THEN
    RAISE EXCEPTION 'Aborting: stock total after (%) does not equal scanned total (%)', v_total_after, v_scanned_total;
  END IF;

  IF v_active_bills <> 0 THEN
    RAISE EXCEPTION 'Aborting: % dummy bills still active after soft-delete', v_active_bills;
  END IF;
END $$;