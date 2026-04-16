

## Fix: Products beyond 1000 not appearing in Stock Report and other pages

### Root Cause
The organization has **1,865 active products**. The `fetchAllPages()` helper in `StockReport.tsx` reuses the same Supabase query builder object and calls `.range()` multiple times on it. The Supabase JS client's `.range()` **mutates** the builder, so subsequent pages (1001+) return incorrect or empty results. Product `NM-M023` (barcode `90002939`) falls beyond the first 1000 and is silently dropped.

The **Purchase Dashboard** issue is separate — the bill date is **March 14, 2026**, so it only appears when no date filter excludes March. When searching by barcode, date filters are still applied, hiding the result.

### Database Audit Result
- Barcode `90002939` → variant `b9aa518d` → product **NM-M023** (Size 2)
- `stock_qty: 1`, `active: true`, `deleted_at: null`, `product_type: goods`
- Purchase bill `PUR/26-27/19` exists, not deleted, `bill_date: 2026-03-14`
- All data is correct — this is purely a client-side fetching bug

### Changes

**1. Fix `fetchAllPages` in StockReport.tsx**
Replace the query-reuse pagination with a factory pattern (callback that rebuilds the query each iteration), matching the working pattern in `fetchAllRows.ts`. Each page gets a fresh query builder so `.range()` works correctly.

**2. Fix Purchase Dashboard barcode search to bypass date filters**
When a barcode-like numeric search term is entered, clear date filters or search across all dates so the user can find bills regardless of date.

### Files Modified
- `src/pages/StockReport.tsx` — Fix `fetchAllPages` to rebuild query per page
- `src/pages/PurchaseBillDashboard.tsx` — Allow barcode search across all dates

