

## Stock Settlement: Scanned Products on Top + Scanned Export

### Changes needed in `src/pages/StockSettlement.tsx`

**1. Sort scanned products to the top of the table**

In the `filtered` useMemo (line ~204), after filtering, sort the results so scanned products appear first (most recently scanned at top):

```
sorted = [...filtered].sort((a, b) => {
  if (a.scanned && !b.scanned) return -1;
  if (!a.scanned && b.scanned) return 1;
  // Among scanned, most recent first
  return (b.lastScannedAt || 0) - (a.lastScannedAt || 0);
});
```

Also include barcode in the search filter so users can search by barcode too.

**2. Add "Export Scanned" button next to existing "Export Stock" button**

Add a new button that exports only scanned/counted products to Excel with columns: Sr No, Barcode, Product Name, Dept, Brand, Unit, Software Qty, Actual Qty, Difference, Status, Source. Include a totals row at the bottom.

This gives users a way to save their physical count work as an Excel file for records.

### Summary

| What | How |
|------|-----|
| Scanned items on top | Sort filtered list: scanned first, ordered by `lastScannedAt` desc |
| Barcode in search | Add `p.barcode` to search filter check |
| Export Scanned button | New button next to Export Stock, exports only `scanned === true` products with actual qty and difference columns |

