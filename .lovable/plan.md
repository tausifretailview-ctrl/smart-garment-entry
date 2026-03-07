

## Audit: Heavy Query Load Pages and Optimization Plan

### Pages Already Optimized (No Changes Needed)
- **CustomerMaster** — server-side pagination + debounced search
- **SupplierMaster** — server-side pagination + debounced search
- **ProductDashboard** — server-side pagination + debounced search + explicit columns
- **StockReport** — uses RPCs for totals, cached filter options, search-on-demand
- **SalesInvoiceDashboard** — just optimized (server-side pagination)

### Pages with Heavy Query Load (Need Optimization)

**1. PurchaseBillDashboard** (1694 lines) — HIGH IMPACT
- Fetches ALL purchase bills in a loop (`select("*")`, 1000-row pages)
- Then fetches ALL purchase_items for ALL bills in background
- Client-side search/date filtering
- **Fix**: Server-side pagination (50 rows), server-side filters, lazy-load items on row expand only, remove bulk item pre-fetch

**2. SaleReturnDashboard** (516 lines) — MEDIUM IMPACT
- Fetches ALL sale returns with `select("*")` in a single query (no pagination at all)
- Uses `useEffect` + `setState` pattern instead of `useQuery`
- Client-side search filtering
- **Fix**: Convert to `useQuery` with server-side pagination, debounced search, explicit column selection

**3. Accounts page** — HIGH IMPACT
- Calls `fetchAllCustomers()`, `fetchAllSalesSummary()`, `fetchAllSuppliers()` — downloads every customer, sale, and supplier row
- Uses this for dashboard metrics and tab data
- **Fix**: Create an RPC `get_accounts_dashboard_stats` for metrics (receivables, payables, expenses). Keep fetchAll only for the specific tab that needs it, and paginate those tabs.

**4. SalesAnalyticsDashboard** — MEDIUM IMPACT
- Fetches all sales in date range (OK), but then calls `fetchAllSaleItems()` for ALL those sale IDs — can be thousands of items
- No staleTime set on queries
- **Fix**: Create an RPC `get_sales_analytics_summary` that returns top products, category breakdown, and payment method stats server-side. Add staleTime.

**5. PurchaseReturnDashboard** — LOW-MEDIUM IMPACT
- Fetches all purchase returns with `select("*")`
- Client-side filtering
- **Fix**: Server-side pagination + explicit columns

**6. GSTReports** — HIGH IMPACT (on-demand)
- Calls `fetchAllSaleItems()` for every sale in the period — massive data download
- **Fix**: Create server-side RPC for GST summary computation

**7. NetProfitAnalysis** — HIGH IMPACT (on-demand)
- Calls `fetchAllSaleItems()` + `fetchAllPurchaseItems()` for all sales/variants
- **Fix**: Create server-side RPC for profit calculation

### Recommended Implementation Priority

| Priority | Page | Impact | Effort |
|----------|------|--------|--------|
| 1 | PurchaseBillDashboard | High (loaded daily) | Medium |
| 2 | SaleReturnDashboard | Medium (loaded daily) | Low |
| 3 | Accounts | High (fetchAll x3) | Medium |
| 4 | PurchaseReturnDashboard | Low-Medium | Low |
| 5 | SalesAnalyticsDashboard | Medium | Medium |
| 6 | GSTReports | High but on-demand | High |
| 7 | NetProfitAnalysis | High but on-demand | High |

### Changes Per File

**PurchaseBillDashboard.tsx**:
- Replace `fetchBills()` loop with `useQuery` + `.range()` for current page only
- Remove Phase 2 bulk item fetch — use lazy loading on expand (already has `fetchBillItems`)
- Add server-side search (`.or()` on supplier_name, supplier_invoice_no)
- Add server-side date filtering
- Use explicit column list instead of `select("*")`
- Add `staleTime: 30000`, `refetchOnWindowFocus: false`

**SaleReturnDashboard.tsx**:
- Replace `useEffect`/`setState` pattern with `useQuery`
- Add server-side pagination with `.range()`
- Add debounced server-side search
- Use explicit columns instead of `select("*")`
- Add `staleTime: 30000`

**PurchaseReturnDashboard.tsx**:
- Same pattern: `useQuery` + server-side pagination + explicit columns

**Accounts.tsx**:
- Create RPC `get_accounts_dashboard_stats` for summary cards
- Defer `fetchAllCustomers`/`fetchAllSalesSummary`/`fetchAllSuppliers` to only load when their specific tab is active (lazy tab loading)

**SalesAnalyticsDashboard.tsx**:
- Add `staleTime: 60000` to all queries
- Consider RPC for top-products aggregation to avoid downloading all sale items

### Database Migration
- Create `get_accounts_dashboard_stats` RPC

### Files to Modify
- `src/pages/PurchaseBillDashboard.tsx`
- `src/pages/SaleReturnDashboard.tsx`
- `src/pages/PurchaseReturnDashboard.tsx`
- `src/pages/Accounts.tsx`
- `src/pages/SalesAnalyticsDashboard.tsx`
- Database migration for accounts RPC

