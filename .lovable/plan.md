

## Plan: Fix Velvet Opening Stock Bill #53 Duplicate Lines

### Audit findings
- Bill: `33b10ed8-cdfc-4f1e-b485-02e7488d2cfe` (PUR/25-26/8, supplier invoice 53, OPENING STOCK)
- 331 line items but only **309 unique barcodes** → **22 duplicate rows** across **19 barcodes** (15 duplicated 2x, 4 duplicated 3x like 150006965, 150006966, 150006967)
- Inserts span 9h 40m → bill was re-saved/edited multiple times without clearing prior items; each insert re-fired the stock trigger, inflating `product_variants.stock_qty`
- Confirmed: barcode 150006965 shows stock_qty = 9 (should be 3); 150006968 = 8 (should be 4); 150006971 = 3 (should be 2); etc.

### Fix (one-time data correction migration, scoped to this bill only)

1. **Remove duplicate purchase_items rows** for this bill — keep the earliest `created_at` per `(barcode, size)`, hard-delete the later duplicates. Hard delete (not soft) so the existing stock trigger reverses the inflated stock automatically.
   ```
   DELETE FROM purchase_items
   WHERE bill_id = '33b10ed8-cdfc-4f1e-b485-02e7488d2cfe'
     AND id IN (
       SELECT id FROM (
         SELECT id, ROW_NUMBER() OVER (
           PARTITION BY barcode, size ORDER BY created_at
         ) AS rn
         FROM purchase_items
         WHERE bill_id = '33b10ed8-cdfc-4f1e-b485-02e7488d2cfe'
           AND deleted_at IS NULL
           AND barcode IS NOT NULL AND barcode <> ''
       ) t WHERE rn > 1
     );
   ```

2. **Recalculate bill header** (`total_qty`, `gross_amount`, `net_amount`) from the cleaned `purchase_items` so dashboard/GST totals align.

3. **Verify stock_qty** for the 19 affected variants drops to expected values (e.g. 150006965 → 3, 150006968 → 4). If the stock trigger does not auto-reverse on hard delete, also issue scoped `UPDATE product_variants SET stock_qty = stock_qty - <extra>` per variant.

4. All statements scoped with `organization_id = 'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'` per the Scoped Mutations core rule.

### Prevention (code side, separate from data fix)
Investigate `PurchaseEntry.tsx` save path for opening-stock / edit-mode to confirm it follows the **Edit-Mode Pattern** (hard-delete existing `purchase_items` for the bill before re-inserting). Likely cause: the OPENING STOCK / large-bill save path appends rows on re-save instead of replacing, possibly when the user clicks Save while still adding rows or after a network retry. Add a safeguard: on edit-save, `DELETE FROM purchase_items WHERE bill_id = ?` before re-insert (already the documented pattern).

### Deliverables
- Migration SQL to dedupe + recalc bill 53
- Verification query output (before vs after stock_qty for the 19 barcodes)
- Code review note on PurchaseEntry save flow with a recommended guard (separate follow-up if a bug is found)

