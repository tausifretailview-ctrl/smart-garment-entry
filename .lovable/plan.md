
# Fix: Intermittent "Insufficient Stock" Error During Invoice Edit

## Problem Analysis

When editing and saving sale bills (Sales Invoice, POS Sales), users intermittently encounter the error:
**"Insufficient stock: needed 2, available 0"**

### Root Cause

The issue stems from a **timing/aggregation flaw** in the stock validation logic during edit mode:

1. **Current Flow:**
   - User loads an invoice for editing
   - `originalItemsForEdit` is stored (variant IDs + quantities from the original invoice)
   - User makes changes to quantities
   - On save, `validateCartStock()` is called, which should add back the "freed" quantities from the original invoice
   - Stock is fetched from database and compared

2. **The Bug - Same Variant Multiple Entries:**
   - When the **same variant appears multiple times** in the new line items (e.g., added twice separately), the validation checks each entry individually
   - The `freedQtyMap` correctly aggregates old items by variant
   - **But the new items are NOT aggregated** - each is checked separately
   - This means for variant X with 2 units in old invoice:
     - First check: needs 2, freed 2, stock 0 → available = 2, **passes**
     - Second check (same variant): needs 2, freed 2 (already counted), stock 0 → available = 2, **passes**
     - **Reality:** Total needed is 4, but only 2 are freed!

3. **The Bug - Stock Already Deducted by Previous Sale:**
   - In some cases, the current database stock is 0 because the original sale already deducted it
   - The "freed" quantity should restore it, but if `originalItemsForEdit` is not properly populated (e.g., loading from draft, or stale state), the freed quantity is 0
   - This causes validation to see: needed 2, freed 0, stock 0 → **fails**

4. **Intermittent Nature:**
   - Only happens when same variant appears multiple times in cart during edit
   - Only happens if `originalItemsForEdit` state is stale or cleared unexpectedly
   - Race conditions between state updates and validation call

## Solution

### 1. Aggregate New Items by Variant Before Validation

Modify `validateCartStock()` to aggregate requested quantities by variant ID before checking stock:

```typescript
const validateCartStock = useCallback(async (
  items: Array<{ variantId: string; quantity: number; ... }>,
  oldItems?: Array<{ variantId: string; quantity: number }>
) => {
  // STEP 1: Aggregate new items by variantId
  const aggregatedNewItems = new Map<string, { variantId: string; quantity: number; productName?: string; size?: string }>();
  for (const item of items) {
    const existing = aggregatedNewItems.get(item.variantId);
    if (existing) {
      existing.quantity += item.quantity;
    } else {
      aggregatedNewItems.set(item.variantId, { ...item });
    }
  }

  // STEP 2: Create freed qty map from old items
  const freedQtyMap = new Map<string, number>();
  if (oldItems && oldItems.length > 0) {
    for (const oldItem of oldItems) {
      const currentFreed = freedQtyMap.get(oldItem.variantId) || 0;
      freedQtyMap.set(oldItem.variantId, currentFreed + oldItem.quantity);
    }
  }

  // STEP 3: Validate aggregated items
  for (const [variantId, item] of aggregatedNewItems) {
    const freedQty = freedQtyMap.get(variantId) || 0;
    const result = await checkStock(variantId, item.quantity, freedQty);
    // ... rest of validation
  }
});
```

### 2. Add Debug Logging for Troubleshooting

Add console logging to help diagnose future issues:

```typescript
console.log('Stock validation:', {
  variantId,
  requestedQty: item.quantity,
  freedQty,
  currentStock: variant.stock_qty,
  availableStock,
  isAvailable: availableStock >= item.quantity
});
```

### 3. Ensure originalItemsForEdit is Preserved During Edits

Add defensive checks in SalesInvoice.tsx to ensure `originalItemsForEdit` isn't cleared prematurely.

---

## Files to Modify

| File | Change |
|------|--------|
| `src/hooks/useStockValidation.tsx` | Aggregate new items by variant before validation; add debug logging |

---

## Technical Details

### Updated `validateCartStock` Function

```typescript
const validateCartStock = useCallback(async (
  items: Array<{ variantId: string; quantity: number; productName?: string; size?: string }>,
  oldItems?: Array<{ variantId: string; quantity: number }>
): Promise<Array<{ productName: string; size: string; requested: number; available: number }>> => {
  setChecking(true);
  const insufficientItems: Array<{ productName: string; size: string; requested: number; available: number }> = [];

  // STEP 1: Aggregate new items by variantId to handle same variant appearing multiple times
  const aggregatedNewItems = new Map<string, { variantId: string; quantity: number; productName?: string; size?: string }>();
  for (const item of items) {
    const existing = aggregatedNewItems.get(item.variantId);
    if (existing) {
      existing.quantity += item.quantity;
      // Keep the first product name and size
    } else {
      aggregatedNewItems.set(item.variantId, { ...item });
    }
  }

  // STEP 2: Create a map of freed quantities from old items
  const freedQtyMap = new Map<string, number>();
  if (oldItems && oldItems.length > 0) {
    for (const oldItem of oldItems) {
      const currentFreed = freedQtyMap.get(oldItem.variantId) || 0;
      freedQtyMap.set(oldItem.variantId, currentFreed + oldItem.quantity);
    }
  }

  try {
    // STEP 3: Validate each aggregated variant
    for (const [variantId, item] of aggregatedNewItems) {
      const freedQty = freedQtyMap.get(variantId) || 0;
      
      const result = await checkStock(variantId, item.quantity, freedQty);
      if (!result.isAvailable) {
        insufficientItems.push({
          productName: item.productName || result.productName,
          size: item.size || result.size,
          requested: item.quantity,
          available: result.availableStock,
        });
      }
    }
  } finally {
    setChecking(false);
  }

  return insufficientItems;
}, [checkStock]);
```

---

## Expected Outcome

After this fix:
1. ✅ Editing invoices will correctly account for all quantities of the same variant
2. ✅ The "freed" stock from the original invoice will be properly added before validation
3. ✅ No more intermittent "Insufficient stock" errors during edit operations
4. ✅ Debug logging will help diagnose any future stock validation issues
