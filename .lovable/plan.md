

## Purchase Return Barcode Scanning - Bug Investigation & Fix Plan

### Issues Found

**1. Same barcode cannot be scanned twice in a row (MAJOR BUG)**
In `PurchaseReturnEntry.tsx` line 278, the code checks:
```
if (isBarcodeInput && searchQuery !== lastBarcodeRef.current)
```
This means if a user scans barcode `40001069` (PUL204 Size 6), then scans the **same barcode again**, it is silently ignored. In purchase returns, scanning the same item multiple times to increase quantity is a common workflow.

**2. No organization_id filter in barcode database query**
The `handleBarcodeSearch` function (line 213-236) queries `product_variants` by barcode but does NOT filter by `organization_id` at the database level. It only checks org membership post-query (line 241). While not currently causing issues (no duplicate barcodes across orgs exist), this is fragile and could fail silently if another org creates a matching barcode.

**3. useEffect re-triggers on lineItems change causing potential race conditions**
The search `useEffect` (line 263) has `lineItems` in its dependency array. Every time an item is added/updated, the entire search effect re-runs, which can interfere with rapid scanning.

### Database Verification
All reported barcodes (40001069, 40001087, 40001067, 40001089, 40001022) exist in the database, are active, and not deleted. The data is correct - the issue is purely in the frontend scanning logic.

### Fix Plan

**File: `src/pages/PurchaseReturnEntry.tsx`**

1. **Remove `lastBarcodeRef` blocking logic** - Allow the same barcode to be scanned consecutively. Instead, reset `lastBarcodeRef` after the search query is cleared, so it only prevents the *same* `useEffect` run from double-processing (not subsequent scans).

2. **Add `organization_id` filter to barcode query** - Add `.eq("products.organization_id", currentOrganization.id)` to the `handleBarcodeSearch` database query for reliable filtering at the DB level.

3. **Remove `lineItems` from useEffect dependency** - Use a `useRef` for lineItems (similar to the POS pattern with `itemsRef`) to avoid the search effect re-triggering on every cart change. This prevents race conditions during rapid scanning.

4. **Use functional state update for adding items** - Change `setLineItems([...lineItems, newItem])` to `setLineItems(prev => [...prev, newItem])` to avoid stale state during rapid scans.

### Technical Details

The changes are isolated to `src/pages/PurchaseReturnEntry.tsx`:
- Modify `handleBarcodeSearch` to include org filter in query
- Add a `lineItemsRef` that stays in sync with `lineItems` state
- Update the barcode scan handler to use `lineItemsRef.current` instead of `lineItems`
- Remove `lineItems` from the `useEffect` dependency array
- Remove the `lastBarcodeRef` guard or reset it properly after each scan completes
- Use functional `setLineItems(prev => ...)` pattern in `handleProductSelect`

