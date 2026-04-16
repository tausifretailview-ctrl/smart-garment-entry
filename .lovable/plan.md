

## Fix MTR/Roll Line Total Calculation in Purchase Bill

**Problem**: When roll-wise entry is enabled, pur_price and sale_price represent **per-meter** cost. Qty is set to 1 (one physical roll). But the line_total and gross calculations use `qty × pur_price` = `1 × 95 = ₹95`, when it should be `meters × pur_price` = `75 × 95 = ₹7,125`.

**Solution**: Create a helper that extracts meters from the `size` field for MTR items and uses that as the multiplier instead of qty.

### Changes in `src/pages/PurchaseEntry.tsx`

1. **Add helper function** near the top:
```typescript
const getMtrMultiplier = (item: LineItem): number => {
  if (item.uom === 'MTR') {
    const meters = parseFloat(item.size);
    if (!isNaN(meters) && meters > 0) return meters;
  }
  return item.qty;
};
```

2. **Fix 6 calculation points** to use `getMtrMultiplier(item)` instead of `item.qty`:

| Line | Current | Fixed |
|------|---------|-------|
| ~318 | `(pur_price * item.qty)` | `(pur_price * getMtrMultiplier({...item, ...updates}))` |
| ~1327 | `r.qty * r.pur_price` | `getMtrMultiplier(r) * r.pur_price` |
| ~1329 | `r.qty * r.pur_price` | `getMtrMultiplier(r) * r.pur_price` |
| ~1943 | `item.qty * item.pur_price` | `getMtrMultiplier(item) * item.pur_price` (addItemRow) |
| ~1966 | `updated.qty * updated.pur_price` | `getMtrMultiplier(updated) * updated.pur_price` (updateLineItem) |
| ~1568 | `1 * pur_price` for same-barcode | Use `getMtrMultiplier` with parsed size |

3. **Display column**: The SUB TOTAL and TOTAL columns in the table (line ~3934) also use `item.qty * item.pur_price` — fix to use `getMtrMultiplier`.

This ensures:
- Roll entry: 75 MTR × ₹95/mtr = ₹7,125 total
- Regular items: unchanged (qty × price)
- Editing pur_price inline recalculates correctly
- Gross totals sum correctly

