
# Fix Stock Validation Error During Invoice Edit

## Problem Summary

When editing a Sales Invoice:
1. Products that are **already in the invoice** (like MB-A02 with 0 current stock but 1 qty in the original invoice) show "Insufficient stock: needed 1, available 0"
2. The validation SHOULD calculate: Available = 0 (DB stock) + 1 (freed from original) = 1

## Root Cause

The `originalItemsForEdit` state is either:
1. **Empty** when the save handler runs (race condition)
2. **Not matching** the variant IDs correctly (if variantId is null/undefined for custom sizes)

Specifically, the issue is that when `validateCartStock` is called with `originalItemsForEdit`, the freed quantity map might not be built correctly if:
- The variant IDs don't match exactly (string vs null vs undefined)
- The `originalItemsForEdit` array is empty due to timing issues

## Solution

### Fix 1: Filter Out Items with Empty/Null Variant IDs from Stock Validation

Items without a variant ID (custom sizes) should be skipped in stock validation since they don't track inventory.

**File: `src/hooks/useStockValidation.tsx`**

Update `validateCartStock` to skip items with null/undefined/empty variantId:

```typescript
// STEP 1: Aggregate new items by variantId - SKIP items without variantId
for (const item of items) {
  // Skip items without variantId (custom sizes don't track stock)
  if (!item.variantId) continue;
  
  const existing = aggregatedNewItems.get(item.variantId);
  // ... rest of logic
}

// STEP 2: Create freed quantities map - SKIP items without variantId
for (const oldItem of oldItems) {
  // Skip items without variantId
  if (!oldItem.variantId) continue;
  
  const currentFreed = freedQtyMap.get(oldItem.variantId) || 0;
  // ... rest of logic
}
```

### Fix 2: Fetch Fresh Original Items from Database During Save

Instead of relying on React state (which can become stale), fetch the current sale_items directly from the database when the user clicks "Update Invoice".

**File: `src/pages/SalesInvoice.tsx`**

In the `handleSaveInvoice` function, before stock validation:

```typescript
// Fetch fresh original items from database for accurate stock validation
let freshOriginalItems: Array<{ variantId: string; quantity: number }> = [];
if (editingInvoiceId) {
  const { data: existingItems } = await supabase
    .from('sale_items')
    .select('variant_id, quantity')
    .eq('sale_id', editingInvoiceId);
  
  if (existingItems) {
    freshOriginalItems = existingItems.map(item => ({
      variantId: item.variant_id,
      quantity: item.quantity,
    }));
  }
}

// Use fresh data for validation
const insufficientItems = await validateCartStock(
  invoiceItems,
  editingInvoiceId ? freshOriginalItems : undefined
);
```

This ensures:
1. We always have the correct quantities from the database
2. No race conditions with React state updates
3. Accurate freed quantities for stock calculation

## Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useStockValidation.tsx` | Skip items without variantId in both new items and old items processing |
| `src/pages/SalesInvoice.tsx` | Fetch fresh sale_items from DB before stock validation in edit mode |

## Technical Details

### Why Database-First Validation?

The Stack Overflow solution for this type of issue recommends:
> "Implement database-first validation before performing the save action. This involves fetching the most current stock levels directly from the database just before the save operation is finalized."

By fetching `sale_items` directly from the database at save time:
- We eliminate stale state issues
- We handle edge cases where React state wasn't updated
- We ensure the freed quantity calculation is always accurate

### Validation Flow After Fix

```
User clicks "Update Invoice"
        ↓
Fetch current sale_items from DB for this invoice
        ↓
Build freedQtyMap from fresh DB data
        ↓
For each cart item:
  - Skip if no variantId (custom size)
  - Get current stock from DB
  - Add freed qty from original invoice
  - Check if requested qty <= available
        ↓
If all pass → proceed with update
If any fail → show error with accurate numbers
```

### Edge Cases Handled

1. **Null/undefined variantId**: Skipped (no stock tracking for custom sizes)
2. **Empty originalItemsForEdit**: Fresh fetch ensures data is never stale
3. **Same variant in multiple rows**: Already handled by aggregation
4. **Component re-mount issues**: Irrelevant since we fetch at save time
