

# Optimize Stock Validation for Invoice Edits

## Problem Summary

Currently, when editing an invoice, the stock validation checks **all** products in the cart, including products that were already saved in the original invoice with the same quantity. This causes unnecessary "Insufficient Stock" errors because:

- A product with qty 2 in the original invoice, still qty 2 after edit → should NOT be checked
- A product with qty 2 in original, changed to qty 3 → should only check if 1 MORE unit is available
- A newly added product → should check full stock availability

## Solution

Modify the `validateCartStock` function to only validate:

1. **Newly added products** (not in original invoice) - check full quantity
2. **Products with INCREASED quantity** - check only the additional quantity needed
3. **Products with same or decreased quantity** - skip validation entirely

### Technical Implementation

**File: `src/hooks/useStockValidation.tsx`**

Update the validation logic to calculate the "net additional" quantity needed:

```typescript
// For each variant in the new cart:
// - If it existed in old invoice with same/more qty → skip (no stock needed)
// - If it's new OR has increased qty → only validate the ADDITIONAL qty needed

for (const [variantId, item] of aggregatedNewItems) {
  const freedQty = freedQtyMap.get(variantId) || 0;
  
  // Calculate net additional quantity needed beyond what was already reserved
  const additionalQtyNeeded = item.quantity - freedQty;
  
  // If no additional stock needed (same qty or reduced), skip validation
  if (additionalQtyNeeded <= 0) {
    console.log('[Stock Validation] Skipping - no additional stock needed:', {
      variantId,
      newQty: item.quantity,
      originalQty: freedQty,
    });
    continue;
  }
  
  // Only check stock for the ADDITIONAL quantity needed
  const result = await checkStock(variantId, additionalQtyNeeded, 0);
  
  if (!result.isAvailable) {
    insufficientItems.push({
      productName: item.productName || result.productName,
      size: item.size || result.size,
      requested: item.quantity,
      available: result.availableStock + freedQty, // Show total available including freed
    });
  }
}
```

### Validation Logic Summary

| Scenario | Original Qty | New Qty | Action |
|----------|-------------|---------|--------|
| Same quantity | 2 | 2 | **Skip** - no stock check needed |
| Reduced quantity | 3 | 2 | **Skip** - releasing stock, not consuming |
| Increased quantity | 2 | 3 | **Check** - only validate 1 additional unit |
| New product | 0 | 3 | **Check** - validate all 3 units |

### Files to Modify

| File | Changes |
|------|---------|
| `src/hooks/useStockValidation.tsx` | Update `validateCartStock` to only check additional quantities needed |

## Benefits

1. No more false "Insufficient Stock" errors for unchanged products
2. Accurate validation for quantity increases
3. Better user experience during invoice edits
4. Faster validation (fewer DB queries when quantities unchanged)

