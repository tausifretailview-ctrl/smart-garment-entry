## GOPI ETHNIC — Stock Reconciliation (direct SQL)

Confirmed: 45 POS bills (27-Jul → today) are dummy scan bills, not real sales. Execute in one migration.

### Step 1 — Zero 197 variants (phantom 207 units)
For every `product_variants` row in the org where `stock_qty > 0`:
- Insert an audit row into `stock_movements`:
  - `movement_type = 'adjustment'`
  - `quantity = -stock_qty` (current)
  - `reason = 'Physical count reconciliation 27-Jul-2026 — zero phantom stock'`
- `UPDATE product_variants SET stock_qty = 0` for those rows.

### Step 2 — Soft-delete 45 dummy POS bills
```sql
UPDATE sales
SET deleted_at = now(), deleted_by = <caller>, is_cancelled = true
WHERE organization_id = 'c2bd3701-8f43-467e-a9c5-e21a608c5f3b'
  AND sale_date >= '2026-07-27'
  AND deleted_at IS NULL;

UPDATE sale_items
SET deleted_at = now()
WHERE sale_id IN (<those 45 ids>) AND deleted_at IS NULL;
```
The existing soft-delete stock-reversal trigger will add +1499 back to `product_variants.stock_qty`.

### Step 3 — Post-run verification (returned in migration output)
```sql
SELECT
  SUM(pv.stock_qty) AS total_stock_after,             -- expect 1499
  COUNT(*) FILTER (WHERE pv.stock_qty > 0) AS variants_with_stock,
  (SELECT COUNT(*) FROM sales
    WHERE organization_id = '<org>' AND sale_date >= '2026-07-27'
      AND deleted_at IS NULL) AS active_bills_left   -- expect 0
FROM product_variants pv
JOIN products p ON p.id = pv.product_id
WHERE p.organization_id = '<org>';
```

### Safety
- Wrapped in a single transaction — either everything succeeds or nothing changes.
- No hard delete: bills remain in Recycle Bin, recoverable if needed.
- All stock changes go through `stock_movements` for full audit.
- No customer payments touched (dummy bills).

If total after step 3 ≠ 1499, migration aborts (RAISE EXCEPTION) so state stays consistent.

Approve to switch to build and run the migration.
