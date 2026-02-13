

## Proportional Bill Discount Distribution for Accurate Sale Returns

### Problem
When a total bill discount is applied (e.g., Rs 1,000 off on a Rs 10,000 bill), the discount is stored only at the sale header level (`flat_discount_amount`). Individual `sale_items` rows do not reflect their share of this discount. During sale returns, the system uses the **current product price** (`variant.sale_price`) instead of the **actual discounted sale price**, leading to incorrect refund amounts.

### Solution Overview

```text
+---------------------+       +-------------------------+       +------------------------+
| Sale Save           |       | sale_items table         |       | Sale Return (barcode)  |
| (POS + Invoice)     | ----> | + discount_share         | ----> | Fetch original sale    |
|                     |       | + net_after_discount     |       | item price, not current |
| Distribute flat     |       | + per_qty_net_amount     |       | product price          |
| discount to items   |       |                         |       |                        |
+---------------------+       +-------------------------+       +------------------------+
```

---

### Step 1: Database Migration

Add 3 new columns to `sale_items`:

| Column | Type | Default | Description |
|--------|------|---------|-------------|
| `discount_share` | numeric | 0 | Item's proportional share of total bill discount |
| `net_after_discount` | numeric | 0 | Item gross amount minus discount share |
| `per_qty_net_amount` | numeric | 0 | Net amount per unit (net_after_discount / quantity) |

---

### Step 2: Sale Save Logic (useSaveSale.tsx)

When inserting `sale_items`, calculate and store per-item discount distribution:

```text
For each item:
  item_gross = unit_price * quantity  (already stored as line_total)
  discount_share = (item_gross / sub_total) * flat_discount_amount
  net_after_discount = item_gross - discount_share
  per_qty_net_amount = net_after_discount / quantity
```

This applies to both POS and Sales Invoice saves since both go through `useSaveSale`.

The `CartItem` interface already has `discountAmount` (line-level discount). The new `discount_share` specifically tracks the **bill-level flat discount** portion allocated to each item.

---

### Step 3: Sale Return Entry (SaleReturnEntry.tsx)

When a barcode is scanned for return:

1. Query `sale_items` for the most recent sale containing this barcode/variant
2. Use `per_qty_net_amount` as the return unit price (instead of `variant.sale_price`)
3. Use `net_after_discount` for full-quantity returns
4. Fall back to `line_total / quantity` if `per_qty_net_amount` is 0 (for legacy sales before this change)

**Lookup logic:**
```text
SELECT per_qty_net_amount, net_after_discount, quantity, unit_price
FROM sale_items
WHERE variant_id = ? AND deleted_at IS NULL
ORDER BY created_at DESC
LIMIT 1
```

---

### Files to Modify

1. **Database migration** -- Add 3 columns to `sale_items`
2. **`src/hooks/useSaveSale.tsx`** -- Calculate `discount_share`, `net_after_discount`, `per_qty_net_amount` during item insert (both `saveSale` and `updateSale` functions)
3. **`src/pages/SaleReturnEntry.tsx`** -- Change barcode scan handler and `addProduct` to fetch original sale price from `sale_items` instead of using current `variant.sale_price`

### Important Rules Enforced
- Return amounts always come from stored sale data, never from current product price
- No re-application of discount during returns
- Legacy sales (before migration) gracefully fall back to `line_total / quantity`
- Both POS and Sales Invoice paths are covered (single `useSaveSale` hook)

