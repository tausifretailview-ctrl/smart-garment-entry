

## Completed: Heavy Query Load Optimization

All 5 priority pages optimized:

1. **PurchaseBillDashboard** — Server-side pagination + search + date filters via `useQuery`, removed Phase 2 bulk item pre-fetch (lazy-load on expand only), staleTime 30s
2. **SaleReturnDashboard** — Converted from useEffect/setState to `useQuery` with server-side pagination + debounced search, lazy item loading with cache
3. **PurchaseReturnDashboard** — Server-side pagination + debounced search + date filters via `useQuery`, staleTime 30s
4. **Accounts** — Created `get_accounts_dashboard_stats` RPC for summary cards (replaces 3x fetchAll calls), lazy tab loading (vouchers/sales/customers/suppliers only fetched when their tab is active)
5. **SalesAnalyticsDashboard** — Added staleTime 60s + refetchOnWindowFocus:false to all queries

## Completed: Entry Form Query Optimization (ELLA NOOR slow billing fix)

All entry forms optimized with caching + explicit columns:

1. **QuotationEntry** — Added staleTime 5min + refetchOnWindowFocus:false to customers & products queries, replaced `select('*')` with explicit columns
2. **SaleOrderEntry** — Added staleTime 5min + refetchOnWindowFocus:false to customers & products queries, replaced `select('*, product_variants(*)')` with explicit columns
3. **PurchaseOrderEntry** — Added staleTime 5min + refetchOnWindowFocus:false to suppliers & products queries, replaced `select('*')` with explicit columns
4. **DeliveryChallanEntry** — Added staleTime 5min + refetchOnWindowFocus:false to products query, replaced `select('*, product_variants(*), size_groups(*)')` with explicit columns
5. **PurchaseEntry** — Replaced `select('*')` with explicit columns for suppliers (already had staleTime)
6. **POSSales** — Already optimized (explicit columns + staleTime 5min)
7. **SalesInvoice** — Already optimized
