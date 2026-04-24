

## Fix Size-wise Stock Report grouping bug

### Problem
On the Size-wise tab, products are grouped by `product_name + brand + color` only — the `style` field is **not** part of the grouping key. So all TOP / TALKEE / WHITE variants across **different styles** get merged into one row, and the row shows whatever style was encountered first (e.g. "T5290-2") while the totals actually include other styles too.

Result for your example: All Stock view correctly shows TOP / TALKEE / WHITE / Style T5290-2 = 2 pcs (one in 2XL, one in 3XL), but Size-wise view sums every TOP / TALKEE / WHITE variant regardless of style and reports 22.

### Fix

**File: `src/pages/StockReport.tsx`** (single change in the `sizeWiseData` useMemo around line 824)

Include `department` (which holds the style value) in the grouping key so each style becomes its own row:

```ts
const productKey = `${item.product_name}-${item.brand}-${item.color}-${item.department}`;
```

Everything else (the row label which already shows Brand / Color / Category / Style, the totals row, Excel export, PDF export) keeps working unchanged because each row will now correctly correspond to one (product, brand, color, style) combination.

### Verification after fix
TOP / TALKEE / WHITE / Style T5290-2 row will show only its own variant stock (matching the All Stock tab — 2 pcs across 2XL + 3XL). Other TOP / TALKEE / WHITE products with different styles will appear as separate rows.

### Out of scope
No logic change to filters, fields, All Stock view, exports format, or totals calculation. Only the grouping key is corrected.

