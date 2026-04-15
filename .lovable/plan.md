

## Problem
In the Sales Invoice product search dropdown, the same product appears multiple times when variants have different prices (e.g., ₹120 and ₹60 for "THERMAL ROLL BILL"). This happens because the purchase bill price update creates or updates a variant price, but the old-priced variant still exists. The search returns each variant separately.

## Solution
Deduplicate search results by `product_id + size + color` before displaying, keeping the variant with the most recent/correct price (higher stock or latest price).

## Changes

### File: `src/pages/SalesInvoice.tsx`

After the search results are mapped and price-filtered (~line 992, before sorting), add deduplication logic:

```typescript
// Deduplicate variants by product_id + size + color
// Keep variant with higher stock, or if equal, lower sale_price (updated price)
const dedupeMap = new Map<string, typeof results[0]>();
for (const r of results) {
  const key = `${r.variant.product_id}_${(r.variant.size || '').toLowerCase()}_${(r.variant.color || '').toLowerCase()}`;
  const existing = dedupeMap.get(key);
  if (!existing) {
    dedupeMap.set(key, r);
  } else {
    // Prefer higher stock; if equal, prefer lower price (newer updated price)
    if ((r.variant.stock_qty || 0) > (existing.variant.stock_qty || 0)) {
      dedupeMap.set(key, r);
    } else if ((r.variant.stock_qty || 0) === (existing.variant.stock_qty || 0) && (r.variant.sale_price || 0) < (existing.variant.sale_price || 0)) {
      dedupeMap.set(key, r);
    }
  }
}
results = Array.from(dedupeMap.values());
```

This merges duplicate product rows in the dropdown so only one entry per unique product+size+color combination is shown, with the most relevant variant selected.

