

## Plan: Duplicate Barcode Warning System

### Part 1 — Database Migration

Create a new migration file with:
1. Safe deduplication UPDATE — NULLs out barcodes on duplicate variants with zero stock/sales/purchase history (keeps oldest per org)
2. `check_barcode_duplicate` RPC function — returns matching variants for a given barcode+org, excluding a specific variant ID

SQL is exactly as specified in the request. No unique constraint added.

### Part 2 — PurchaseEntry.tsx Barcode Warning

The barcode in PurchaseEntry line items is displayed as a **read-only Badge** (line 2592), not an editable input. The warning will be shown next to each line item's barcode Badge.

**Approach**: When line items change, check each item's barcode for duplicates using the RPC. Store warnings in a `Map<string, string>` keyed by `temp_id`.

- Add state: `barcodeWarnings: Map<string, string>`
- Add a `useEffect` that fires when `lineItems` changes (debounced 600ms), iterating items and calling `check_barcode_duplicate` for barcodes with length > 6
- Render the amber warning box below the barcode Badge cell (line ~2594) when a warning exists for that item
- Add `AlertTriangle` to the lucide-react import

### Part 3 — ProductDashboard.tsx Barcode Warning

The variant barcode is read-only text at line 996. Same approach:

- After variants are loaded for the expanded product, compute duplicate barcodes client-side from the current search results (cheaper than RPC for each variant)
- Find barcodes that appear in multiple variants across `productRows`
- Show amber warning inline next to the barcode text for duplicates
- Add `AlertTriangle` to the lucide-react import

### Part 4 — BarcodePrinting.tsx Duplicate Badge

In the label items table (line 3690), add a `DUP` Badge next to the barcode text:

- Compute `duplicateBarcodes: Set<string>` from `labelItems` after they load — barcodes appearing more than once
- Render the amber `DUP` Badge inline after the barcode text
- Add `Badge` import (already available via `@/components/ui/badge`)

### Files Changed
1. **New migration** — dedup + `check_barcode_duplicate` function
2. **`src/pages/PurchaseEntry.tsx`** — barcode warning state + useEffect + amber warning render
3. **`src/pages/ProductDashboard.tsx`** — client-side duplicate detection + amber warning in variant table
4. **`src/pages/BarcodePrinting.tsx`** — duplicate set computation + DUP badge in label items table

