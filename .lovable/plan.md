

## Fix: Price Update Not Persisting in Product Master

### Root Cause Analysis

After auditing the full flow, I found **two issues**:

1. **No row-count verification**: The `handlePriceUpdateConfirm` function in `PurchaseEntry.tsx` (line 2316) updates `product_variants` but never checks if rows were actually affected. Supabase returns no error when RLS blocks an update — it silently updates 0 rows. The user sees a "success" toast even when nothing changed.

2. **Missing `organization_id` in WHERE clause**: The update uses only `.eq("id", skuId)` without organization scoping. While RLS should handle this, adding explicit `organization_id` filtering ensures correct behavior and follows the project's "Scoped Mutations" core rule.

3. **Stale selection state in dialog**: `PriceUpdateConfirmDialog` initializes `selectedItems` via `useState` — if the dialog component stays mounted between opens, the selection won't reflect new `priceChanges`.

### Changes

#### 1. `src/pages/PurchaseEntry.tsx` — `handlePriceUpdateConfirm`

- Add `.eq("organization_id", currentOrganization.id)` to the update query
- Add `.select()` with count check: if 0 rows returned, throw an error
- Add console logging for debugging: log the `skuId` and updates being applied
- On partial failure (some variants updated, some not), show a warning toast listing which ones failed

#### 2. `src/components/PriceUpdateConfirmDialog.tsx` — Sync selection state

- Add `useEffect` that re-initializes `selectedItems` whenever `priceChanges` prop changes, ensuring fresh selection state every time the dialog opens with new data

### Technical Details

```typescript
// Before (silent failure):
const { error } = await supabase
  .from("product_variants")
  .update(updates)
  .eq("id", skuId);

// After (verified update):
const { data, error } = await supabase
  .from("product_variants")
  .update(updates)
  .eq("id", skuId)
  .eq("organization_id", currentOrganization.id)
  .select("id");

if (error) throw error;
if (!data || data.length === 0) {
  failedUpdates.push(skuId);
}
```

- No database changes needed
- Follows existing "Scoped Mutations" pattern
- Audit trail already works via `audit_variant_price_changes` trigger (verified: PRICE_CHANGE logs exist in audit_logs)

