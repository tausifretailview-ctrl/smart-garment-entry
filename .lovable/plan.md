

## Fix Sale Return Edit Double-Stock Bug

### Problem
When editing a sale return in `SaleReturnEntry.tsx` (lines 710-745), the soft-delete→hard-delete→insert pattern causes stock inflation. The soft-delete sets `deleted_at`, so the hard-delete trigger skips stock reversal, but the new INSERT trigger adds stock again — resulting in +2× instead of +1×.

### Solution: Match the Sale Edit Pattern (Simplest Fix)

The sale edit flow in `useSaveSale.tsx` works correctly: it hard-deletes items directly (no soft-delete first), letting the DELETE trigger properly reverse stock, then INSERTs new items. We apply the same pattern to sale return edits.

### Changes

**1. `src/pages/SaleReturnEntry.tsx` — Fix edit flow (lines 710-725)**

Remove the soft-delete step entirely. Just hard-delete the old items directly so the `handle_sale_return_item_delete` trigger fires normally (sees `deleted_at IS NULL` → reverses stock), then INSERT new items (trigger adds stock).

```text
BEFORE (broken):
  soft-delete items (set deleted_at) → hard-delete (trigger SKIPS) → INSERT (trigger adds)
  Net: old stock never reversed, new stock added = INFLATED

AFTER (fixed):
  hard-delete items (trigger FIRES, reverses stock) → INSERT (trigger adds)
  Net: old stock reversed, new stock added = CORRECT
```

**2. DB Migration — Add `deleted_at` guard to UPDATE triggers**

Add `IF OLD.deleted_at IS NOT NULL OR NEW.deleted_at IS NOT NULL THEN RETURN NEW` to:
- `handle_purchase_item_update`
- `handle_sale_item_update`

This prevents accidental stock adjustments if an UPDATE touches a soft-deleted row.

**3. Run global reconciliation after fix**

After deploying the code fix, re-run the reconciliation to correct historically inflated variants from past edits.

### Impact
- Fixes the #1 root cause of inflated stock across all organizations
- Low risk: mirrors the already-working sale edit pattern
- No changes to any other stock logic

