

## Analysis

The build error is **not a code issue** — it's a deployment upload failure (R2/S3 transport error). The code compiled successfully. This will resolve on the next deployment attempt.

Regarding the Modern Wholesale template pagination: the current code already has multi-page support with header repetition and items-per-page splitting (A4: 22, A5-vertical: 14, A5-horizontal: 10). However, there are issues to fix:

### Problems Identified

1. **SR numbering** — Already continuous across pages (uses `startIndex`), but need to verify it works correctly with size grouping enabled
2. **Footer/summary overflow** — On the last page, the summary + signature section can overflow beyond the page boundary because `minItemRows` fills empty rows even when there's not enough room for the footer
3. **Page break reliability** — CSS `page-break-after` needs reinforcement for consistent print output

### Plan

**File: `src/components/invoice-templates/ModernWholesaleTemplate.tsx`**

1. **Reduce items on last page** to reserve space for the summary/payment/signature footer:
   - Last page gets fewer items (e.g., A4: 22→18 on last page, A5-vertical: 14→10 on last page) so the footer always fits
   - Recalculate page splitting: fill early pages fully, leave room on the final page

2. **Remove excessive empty row padding on last page** — currently `effectiveMinItemRows` can push the footer off-page. Reduce empty rows when items + footer would overflow

3. **Ensure header repeats reliably** — already implemented via `renderHeader()` call in `renderPage()`, just need to verify print CSS doesn't collapse it

4. **Add `page-break-inside: avoid` to the summary section** to prevent it from splitting across pages

### Technical Details

```text
Page Layout (A5-vertical example):
┌─────────────────────┐
│  HEADER (repeated)  │
│  Customer Info       │
├─────────────────────┤
│  Items 1-12         │  ← First page: up to 12 items
│  (empty rows)       │
├─────────────────────┤
│  "Continued..."     │
│  Page 1 of 2        │
└─────────────────────┘
        ↓ page break
┌─────────────────────┐
│  HEADER (repeated)  │
│  Customer Info       │
├─────────────────────┤
│  Items 13-15        │  ← Last page: fewer items
│  (empty rows)       │
├─────────────────────┤
│  TOTAL QTY row      │
│  Amount in Words    │
│  Summary / GST      │
│  Signature          │
│  Page 2 of 2        │
└─────────────────────┘
```

Key change: Split pagination so early pages hold full `itemsPerPage` count, but the **last page reserves ~4-6 rows** worth of space for the footer section (summary, bank details, terms, signature).

