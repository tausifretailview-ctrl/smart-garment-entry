

## Fix: False Duplicate Barcode Warnings When Editing Old Purchase Bills

### Problem
When editing old purchase bills, the barcode duplicate detection fires false positives because:
1. Two rows with the same barcode but the **same variant** (same `sku_id`) are flagged — these should merge quantities, not warn
2. Items already in the bill being edited exist in the database, so the cross-bill RPC check finds them as "duplicates" of themselves

### Changes — `src/pages/PurchaseEntry.tsx`

**Fix 1 (lines 443-452): Smarter in-bill duplicate detection**

Change the in-bill duplicate map to track `sku_id` alongside `temp_id`. Only flag as duplicate when the same barcode appears on rows with **different** `sku_id` values. Same barcode + same variant = not a real duplicate.

**Fix 2 (lines 467-473): Exclude original bill items from cross-bill check**

After the `check_barcode_duplicate` RPC returns results, also filter out any `variant_id` that belongs to the original bill's items (`originalLineItems`). This prevents the system from treating the bill's own existing items as external duplicates.

**Fix 3: No auto-merge change** — The auto-merge of duplicate rows when re-adding the same variant is a separate UX enhancement and risks changing purchase entry behavior (per-piece tracking relies on separate rows). Will skip this to avoid breaking existing flows.

### Files Modified
- `src/pages/PurchaseEntry.tsx` — lines ~443-473 (duplicate detection logic only)

### What Won't Change
- Barcode generation logic
- Save flow and `originalLineItems` tracking
- IMEI scan dialog
- Size grid or any other pages

