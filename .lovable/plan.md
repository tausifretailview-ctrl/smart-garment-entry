

## Plan: Add Zero Quantity Validation to Field Sales Order Entry

### Problem Statement
The Field Sales app (`SalesmanOrderEntry.tsx`) currently has a potential gap in validation that could allow orders with 0-quantity items to be booked. While the Size Grid dialog validates that at least one size has a quantity > 0, the final `saveOrder` function only checks if `orderItems.length === 0` but does not verify that:
1. Individual item quantities are greater than zero
2. The total order quantity is valid

### Solution Overview
Add explicit validation checks in the `saveOrder` function to:
1. Validate each item has a quantity > 0
2. Ensure total order quantity is greater than zero
3. Show clear error messages to the user

---

## Technical Implementation

### File to Modify

**`src/pages/salesman/SalesmanOrderEntry.tsx`**

### Changes Required

#### 1. Add Zero Quantity Validation in `saveOrder` Function (Lines 464-472)

**Current Code:**
```typescript
const saveOrder = async (shareAfter: boolean = false) => {
  if (!selectedCustomer) {
    toast.error("Please select a customer");
    return;
  }
  if (orderItems.length === 0) {
    toast.error("Please add at least one item");
    return;
  }
  // ... continues to save
```

**Updated Code:**
```typescript
const saveOrder = async (shareAfter: boolean = false) => {
  if (!selectedCustomer) {
    toast.error("Please select a customer");
    return;
  }
  if (orderItems.length === 0) {
    toast.error("Please add at least one item");
    return;
  }

  // NEW: Validate no items have zero quantity
  const zeroQtyItems = orderItems.filter(item => item.quantity <= 0);
  if (zeroQtyItems.length > 0) {
    const itemNames = zeroQtyItems.map(item => 
      `${item.product.product_name} (${item.variant.size})`
    ).join(", ");
    toast.error(`Invalid quantity for: ${itemNames}`);
    return;
  }

  // NEW: Validate total quantity is greater than zero
  const totalQuantity = orderItems.reduce((sum, item) => sum + item.quantity, 0);
  if (totalQuantity <= 0) {
    toast.error("Order must have at least one item with quantity greater than 0");
    return;
  }

  setSaving(true);
  // ... rest of save logic
```

#### 2. Add Minimum Quantity Enforcement in `updateQuantity` Function (Lines 447-458)

**Current Code:**
```typescript
const updateQuantity = (itemId: string, delta: number) => {
  const updated = orderItems.map(item => {
    if (item.id === itemId) {
      const maxQty = item.isCustomSize ? Infinity : item.variant.stock_qty;
      const newQty = Math.max(1, Math.min(maxQty, item.quantity + delta));
      return { ...item, quantity: newQty, line_total: newQty * item.unit_price };
    }
    return item;
  });
  setOrderItems(updated);
};
```

This already enforces `Math.max(1, ...)` which ensures quantity cannot go below 1 — this is correct and already in place.

#### 3. (Optional Enhancement) Add Visual Warning for Zero Quantity Items

If somehow a 0-quantity item gets into the list, show it with a warning style:
- Add a red border/highlight to items with quantity ≤ 0
- This provides visual feedback before save attempt

---

## Implementation Summary

| Change | Location | Purpose |
|--------|----------|---------|
| Zero quantity item check | `saveOrder()` | Block saving orders with any 0-qty items |
| Total quantity check | `saveOrder()` | Block saving orders with 0 total quantity |
| Min quantity enforcement | `updateQuantity()` | Already implemented - prevents qty < 1 |

---

## Testing Scenarios

1. **Normal Order Flow** - Add items with valid quantities → Should save successfully
2. **Empty Order** - Try to save without items → Should show "Please add at least one item"
3. **Direct API Test** - Attempt to insert 0-qty via Supabase → Should be caught by validation
4. **Edge Case** - Restore draft with corrupted data → Validation will catch on save

---

## Benefits

- Prevents invalid orders from being created
- Clear error messages help salesmen understand what went wrong
- Works in conjunction with existing draft save functionality
- Minimal code changes - surgical fix to address the specific gap

