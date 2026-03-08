

## Fix: Purchase Dashboard Qty Shows 0 + Barcode Print Shows 0

### Root Cause

The purchase dashboard shows qty as **0** because the qty badge (line 886) reads from `billItems[bill.id]` — a client-side cache that is **only populated when a row is expanded**. Before expansion, `billItems[bill.id]` is `undefined`, so it defaults to 0.

The same issue affects:
- **Barcode printing from context menu** (line 182) — uses `billItems[bill.id] || []` which is empty before expansion
- **Summary stats totalQty** (line 756) — also depends on `billItems`

The barcode print from the **action button** (line 670, `handlePrintBarcodes`) works correctly because it fetches items fresh from the database. But the context menu version does not.

### Solution

**Step 1: Add `total_qty` column to `purchase_bills` table**

Create a database migration to:
- Add `total_qty` integer column (default 0) to `purchase_bills`
- Backfill existing rows: `UPDATE purchase_bills SET total_qty = (SELECT COALESCE(SUM(qty),0) FROM purchase_items WHERE bill_id = purchase_bills.id)`
- Create a trigger to auto-update `total_qty` on `purchase_items` INSERT/UPDATE/DELETE (same pattern used for `sales.total_qty`)

**Step 2: Include `total_qty` in dashboard query**

In `PurchaseBillDashboard.tsx`:
- Add `total_qty` to the select list (line 296)
- Add `total_qty` to the `PurchaseBill` interface
- Replace `billItems[bill.id]?.reduce(...)` with `bill.total_qty` in the supplier column badge (line 886)
- Replace `billItems` dependency in `summaryStats.totalQty` with `bill.total_qty` (line 756)

**Step 3: Fix context menu barcode print**

The context menu "Print Barcodes" (line 182) uses cached `billItems` which may be empty. Change it to use the same fresh-fetch approach as `handlePrintBarcodes` (line 670) — fetch items from database on-demand instead of relying on the expand cache.

### Files to Modify
- **Database migration**: Add `total_qty` column + backfill + trigger on `purchase_bills`
- `src/pages/PurchaseBillDashboard.tsx`: Use `total_qty` from query, fix context menu barcode print

### Impact
- Qty displays immediately without expanding rows
- Barcode printing always has correct quantities
- No extra queries needed — single column on the parent table

