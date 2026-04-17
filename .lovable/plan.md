

## Why "75 MTR × ₹95" is still showing as ₹95

I traced through every code path that adds rows to the Purchase Bill. The math itself is correct everywhere — `getMtrMultiplier(item) * item.pur_price` is used in:
- Sub Total cell (line 3961) ✓
- Line Total ✓
- Gross / Net total reducers (lines 1349-1356) ✓
- Live updates on qty/price/discount/size change (line 1992) ✓
- Edit-mode reload (lines 789, 956 — yesterday's fix) ✓
- Roll Entry insert (line 2128) ✓
- Inline search add (line 1938) ✓
- Same-barcode-series add (line 1590) ✓

**All of those depend on `item.uom === 'MTR'`.** If `uom` is missing/undefined on the row, `getMtrMultiplier` falls back to `qty` (=1), so the bill computes `1 × ₹95 = ₹95` — exactly what your screenshot shows (no MTR badge next to qty input either, because that badge only renders when `item.uom !== 'NOS'`).

DB confirms barcodes 250001069 & 250001070 are saved with `products.uom = 'MTR'` and `size = '75 MTR' / '85 MTR'`. So the data is fine — the bug is that **two row-loading paths still don't backfill `uom`**:

### The gap

1. **Draft restore** (`loadDraftData`, line 343-376) — sets `lineItems` straight from the draft JSON. Drafts saved before yesterday's fix have `uom: undefined`, so the restored rows lose MTR behavior permanently until edited.
2. **sessionStorage state restore** (line 843, used when navigating away to add a product and coming back) — same: pushes the saved `lineItems` back into state with no uom enrichment.

The user's screenshot is almost certainly a draft auto-restored on page load (or a state restore after navigating to add a product/supplier and back) — so the row was originally added with correct uom, persisted to the draft without uom (or with stale uom), and reloaded without re-fetching.

### Fix

Add the same uom-backfill we already do in edit-mode load to **draft restore** and **sessionStorage restore**:

1. After `setLineItems(items)` in `loadDraftData` and the sessionStorage restore block, collect distinct `product_id`s, fetch `products.uom` for each in one query, and overwrite each line item's `uom` from the products map before storing.
2. Recompute `line_total` for each row using `getMtrMultiplier` so totals (Gross/Net/Sub-Total cells) are immediately correct without the user having to click each row.

Optionally tighten things up so this can never happen again:
3. In `addInlineRow` / `handleProductSelect` / `handleProductSelectSameBarcode`, if `variant.uom` is missing, fall back to a one-shot `products.uom` lookup (defensive — should already be set by the search query, but guards against stale variant objects).

### Files to touch
- `src/pages/PurchaseEntry.tsx` — `loadDraftData` (≈ line 343), sessionStorage restore (≈ line 820-844), and small defensive fallback in the 3 add-row functions.

### Verification
After fix, reloading any in-progress draft with a 75 MTR roll @ ₹95 must show:
- MTR badge next to qty input
- SUB TOTAL cell = `₹7,125.00`
- TOTAL (line) = `₹7,125.00`
- Footer NET = `₹15,200` for both rows combined

