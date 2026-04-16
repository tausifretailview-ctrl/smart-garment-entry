

## Fix MTR/Roll Total Calculation in Sales Invoice

**Problem**: Same issue as Purchase Bill — when a roll product (79 MTR, sale price ₹110/mtr) is scanned, the total shows ₹110 (1 × 110) instead of ₹8,690 (79 × 110). The price is per-meter but qty is 1 (one roll).

### Changes in `src/pages/SalesInvoice.tsx`

1. **Add `getMtrMultiplier` helper** (same pattern as PurchaseEntry):
```typescript
const getMtrMultiplier = (item: { uom?: string; size?: string; quantity: number }): number => {
  if ((item.uom || '').toUpperCase() === 'MTR') {
    const meters = parseFloat(item.size || '');
    if (!isNaN(meters) && meters > 0) return meters;
  }
  return item.quantity;
};
```

2. **Fix `calculateLineTotal`** (line ~1643): Use `getMtrMultiplier(item)` instead of `item.quantity` for `baseAmount`.

3. **Fix gross/net totals** (lines ~2566-2593): Replace `item.salePrice * item.quantity` with `item.salePrice * getMtrMultiplier(item)` in:
   - `grossAmount` calculation
   - `lineItemDiscount` calculation
   - `totalGST` calculation

4. **Fix mobile +/- buttons** (lines ~2743-2749): Use `getMtrMultiplier` for lineTotal recalculation on quantity change.

5. **Fix footer total row** (line ~3624): Already uses `grossAmount` which will be fixed by step 3.

This ensures:
- 79 MTR × ₹110/mtr = ₹8,690 total per line
- Net amount updates correctly
- GST calculated on full roll value
- Regular (non-MTR) items unchanged

