
## Fix: MTR Multiplier Lost When Editing Existing Bills

### Root cause
`purchase_items` and `sale_items` tables don't store `uom` — it lives on `products.uom`. When opening an existing bill in **edit mode**, both `loadBillById` paths in `PurchaseEntry.tsx` (lines 765-787 and 925-947) and the equivalent in `SalesInvoice.tsx` map DB rows to `LineItem` **without populating `uom`**. So `getMtrMultiplier` sees `item.uom = undefined`, falls back to `qty` (=1), and shows ₹95 instead of 75 × ₹95 = ₹7,125.

The user's screenshot confirms this: no "MTR" badge next to the qty input (which only renders when `item.uom === 'MTR'`).

The new-line scan path is correct — search results already join `products(uom)`. The bug only bites on edit/navigate-existing-bill.

### Fix

**1. `src/pages/PurchaseEntry.tsx`** — both edit-load paths
- Extend the `products` SELECT in lines ~754-757 and ~908-911 to include `uom`:
  ```
  .select('id, brand, category, style, color, uom')
  ```
- Store `uom` in `productDetailsMap` alongside brand/category/style/color.
- Set `uom: productDetails?.uom || 'NOS'` on each loaded `LineItem` (lines ~786 and ~946).
- Recalculate `line_total` after load using `getMtrMultiplier` so totals match the in-memory formula (defensive — in case stored `line_total` was wrong).

**2. `src/pages/SalesInvoice.tsx`** — `loadInvoiceById`
- Same fix: fetch `products.uom`, populate `uom` on loaded line items, recalc line totals via the existing MTR helper.

**3. Verification**
After the fix, opening Purchase Bill / Sales Invoice with the FLEXI-TEST barcodes (250001052 size "75 MTR", 250001053 size "85 MTR") should show:
- Qty cell: `1 MTR` badge visible
- Sub Total: `₹7,125.00` (75 × 95) and `₹8,075.00` (85 × 95)
- Bill totals recalculated correctly

### Files touched
- `src/pages/PurchaseEntry.tsx` (2 edit-load blocks)
- `src/pages/SalesInvoice.tsx` (1 edit-load block)

No DB migration needed — uom stays derived from `products` on every load.
