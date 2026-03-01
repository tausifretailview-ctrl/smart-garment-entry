

# Performance Optimization for Report Components

## Overview
Apply caching, payload optimization, and pagination across 5 major report components to reduce cloud egress, eliminate multi-tab query storms, and improve load times.

---

## Changes by File

### 1. SalesReportByCustomer.tsx
**Caching**: Add `staleTime: 300000`, `gcTime: 1800000`, `refetchOnWindowFocus: false` to both the customers query and the sales-report query.

**Payload**: The `fetchAllSalesWithFilters` utility already selects explicit columns -- no change needed there. However, the Sales Report only uses 8 fields but the fetch function returns 19 columns. Create a lighter fetch or trim the select in a new variant.

**Pagination**: Add client-side pagination (100 rows per page) to the Sales Transactions table instead of rendering all rows at once.

**Date guard**: When no dates are selected, the query fetches ALL sales ever. Add a default date range (current month) so users don't accidentally load unbounded data.

### 2. DailyTally.tsx
**Caching**: Add `staleTime: 300000`, `gcTime: 1800000`, `refetchOnWindowFocus: false` to all 6 `useQuery` hooks (sales, vouchers, advances, refunds, snapshot, yesterday snapshot, settings).

**Payload**: The snapshot query uses `.select("*")` -- replace with explicit columns: `id, tally_date, opening_cash, expected_cash, physical_cash, difference_amount, leave_in_drawer, deposit_to_bank, handover_to_owner, notes, created_by`. The settings query also uses `.select("*")` -- replace with `business_name`. All other queries already use explicit columns.

**No pagination needed** -- DailyTally is single-day scoped, so row counts are naturally small.

### 3. ItemWiseSalesReport.tsx
**Caching**: Add `staleTime: 300000`, `gcTime: 1800000`, `refetchOnWindowFocus: false` to the main `useQuery` hook.

**Payload**: Already uses explicit column selects -- good. The filter options `useEffect` fetches `brand, category, style` from products and `customer_name` from sales without any row limit, which could be expensive. Wrap these in `useQuery` with caching.

**Pagination**: Add client-side pagination (100 rows per page) to the results table.

### 4. StockReport.tsx
**Caching**: The StockReport uses imperative `useEffect` + `setState` rather than `useQuery`. The global totals and filter options fetches run on every mount with no caching. Convert `fetchGlobalTotals` and `fetchFilterOptions` to `useQuery` hooks with `staleTime: 300000` and `refetchOnWindowFocus: false`.

**Payload**: The `fetchGlobalTotals` function fetches `products!inner(product_type, deleted_at)` as nested data on every variant -- this is necessary for the join filter but is already reasonably scoped. No change needed.

**Pagination**: Already implements client-side pagination (100 items/page) -- good.

### 5. GSTReports.tsx
**Caching**: GST Reports use imperative `async` functions triggered by button clicks (not `useQuery`), so multi-tab refetch storms are not an issue. No caching changes needed.

**Payload**: Sales queries already use explicit columns. The GSTR-1 query fetches `customers(gst_number, address)` which is appropriate for GST. No payload changes needed.

**No pagination needed** -- GST reports are generated on-demand and typically scoped to a single month/quarter.

---

## Summary of All Edits

| File | Caching | Payload Fix | Pagination | Date Guard |
|------|---------|-------------|------------|------------|
| SalesReportByCustomer | Add staleTime/gcTime/refetchOnWindowFocus | Trim select to 8 cols | Add 100-row pagination | Default to current month |
| DailyTally | Add to all 6 queries | Fix `select("*")` on snapshot + settings | Not needed | Not needed (single day) |
| ItemWiseSalesReport | Add to main query + convert filters to useQuery | Already good | Add 100-row pagination | Not needed (has period selector) |
| StockReport | Convert imperative fetches to useQuery with caching | Already good | Already done | Not needed (search-based) |
| GSTReports | Not needed (button-triggered) | Already good | Not needed | Not needed (has period selector) |

---

## Technical Details

### Caching Constants (shared across all reports)
```typescript
staleTime: 5 * 60 * 1000,    // 5 minutes
gcTime: 30 * 60 * 1000,      // 30 minutes  
refetchOnWindowFocus: false,
```

### New lightweight sales fetch for SalesReportByCustomer
Instead of fetching 19 columns via `fetchAllSalesWithFilters`, add a direct query with only: `id, sale_date, sale_number, customer_name, gross_amount, discount_amount, net_amount, payment_method, payment_status`.

### Pagination pattern (SalesReportByCustomer + ItemWiseSalesReport)
```typescript
const [currentPage, setCurrentPage] = useState(1);
const ITEMS_PER_PAGE = 100;
const paginatedData = filteredData.slice((currentPage - 1) * ITEMS_PER_PAGE, currentPage * ITEMS_PER_PAGE);
const totalPages = Math.ceil(filteredData.length / ITEMS_PER_PAGE);
```

### Files Modified
1. `src/pages/SalesReportByCustomer.tsx`
2. `src/pages/DailyTally.tsx`
3. `src/pages/ItemWiseSalesReport.tsx`
4. `src/pages/StockReport.tsx`

No changes to `GSTReports.tsx` (already optimized via on-demand generation).

