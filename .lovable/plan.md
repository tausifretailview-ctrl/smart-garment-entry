

## Round-Off Distribution in Sale Items + Bill Number Lookup in Sale Return

### Problem
1. **Round-off not distributed**: When a bill has round-off (e.g., -1190), the `per_qty_net_amount` in `sale_items` only accounts for flat discount distribution, NOT round-off. So when a barcode is scanned for return, the refund amount is higher than what the customer actually paid.
2. **No bill number lookup**: The Floating Sale Return dialog has no way to enter an original sale/bill number. Without it, the system picks the most recent sale price for that variant, which may not match the actual transaction being returned.

### Solution

**1. Add `round_off_share` column to `sale_items` table**
- New column to store proportionally distributed round-off per line item
- Formula: `(itemGross / subTotal) * roundOff`

**2. Update `per_qty_net_amount` calculation in `useSaveSale.tsx`**
- Current: `per_qty_net_amount = (line_total - discount_share) / quantity`
- New: `per_qty_net_amount = (line_total - discount_share - round_off_share) / quantity`
- This applies to all 3 save paths (new sale, update sale, finalize held sale)

**3. Add Sale Bill Number input to Floating Sale Return**
- Add an input field for "Original Sale No" above the barcode scanner
- When a bill number is entered and items are scanned:
  - Look up items from that specific sale (`sale_items` where `sale_id` matches)
  - Use exact `per_qty_net_amount` from that sale record
  - Auto-populate all items from that bill with their exact prices
- When no bill number is entered (current behavior):
  - Use most recent `per_qty_net_amount` for the scanned variant (which now includes round-off)

### Files to Change

| File | Change |
|------|--------|
| **Database migration** | Add `round_off_share` column (numeric, default 0) to `sale_items` |
| `src/hooks/useSaveSale.tsx` | Distribute round-off proportionally and include in `per_qty_net_amount` (3 locations) |
| `src/components/FloatingSaleReturn.tsx` | Add bill number input; fetch exact items from specific sale when bill number provided; update `fetchUnitPrice` to include round-off share |

### Technical Details

**Round-off distribution formula (useSaveSale.tsx):**
```typescript
const roundOffAmount = saleData.roundOff || 0;
const roundOffShare = subTotal > 0 ? (itemGross / subTotal) * roundOffAmount : 0;
const netAfterDiscount = itemGross - discountShare - roundOffShare;
const perQtyNetAmount = item.quantity > 0 ? netAfterDiscount / item.quantity : 0;
```

**Bill number lookup flow (FloatingSaleReturn.tsx):**
```
User enters bill number (e.g., "POS/25-26/52")
  -> Query: sales WHERE sale_number = input AND organization_id = orgId
  -> If found: fetch all sale_items for that sale_id
  -> Each scanned barcode matches against those items for exact pricing
  -> If barcode not in that bill: show warning "Item not found in this bill"

No bill number entered:
  -> Current behavior: fetch latest per_qty_net_amount for that variant
```

**Example with the screenshot data:**
- Bill: 2 items, gross 8090, round-off -1190, net 6900
- Item 1 (3895): round_off_share = (3895/8090) * -1190 = -573.05, per_qty = 3895 - 0 - (-573.05) = ... 
- Wait -- round-off is negative (discount-like), so subtracting a negative adds. Let me reconsider.
- Actually round_off can be negative (reducing total) or positive (increasing total)
- For return: customer paid 6900 for 8090 worth of goods, so each item should refund proportionally to 6900
- Item 1: (3895/8090) * 6900 = 3322.87
- Item 2: (4195/8090) * 6900 = 3577.13
- Total: 6900 (correct)

**Correct formula:**
```
roundOffShare = (itemGross / subTotal) * roundOffAmount  // roundOff is -1190
netAfterDiscount = itemGross - discountShare - roundOffShare
// = 3895 - 0 - (3895/8090 * -1190) = 3895 - (-573.05) = 4468 -- WRONG
```

The issue is the sign. Round-off of -1190 means the total was REDUCED. So we need:
```
netAfterAll = itemGross - discountShare + roundOffShare  
// where roundOffShare = (3895/8090) * (-1190) = -573.05
// netAfterAll = 3895 - 0 + (-573.05) = 3321.95
```

Or equivalently, store `round_off_share` and compute:
```
per_qty_net_amount = (line_total - discount_share + round_off_share) / quantity
```

Since round_off can be negative (reduction) or positive (increase), adding it directly gives the correct result. This matches how the bill total works: `net = gross - discount + roundOff`.

