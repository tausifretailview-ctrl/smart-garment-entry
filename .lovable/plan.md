

## Completed: Heavy Query Load Optimization

All 5 priority pages optimized:

1. **PurchaseBillDashboard** — Server-side pagination + search + date filters via `useQuery`, removed Phase 2 bulk item pre-fetch (lazy-load on expand only), staleTime 30s
2. **SaleReturnDashboard** — Converted from useEffect/setState to `useQuery` with server-side pagination + debounced search, lazy item loading with cache
3. **PurchaseReturnDashboard** — Server-side pagination + debounced search + date filters via `useQuery`, staleTime 30s
4. **Accounts** — Created `get_accounts_dashboard_stats` RPC for summary cards (replaces 3x fetchAll calls), lazy tab loading (vouchers/sales/customers/suppliers only fetched when their tab is active)
5. **SalesAnalyticsDashboard** — Added staleTime 60s + refetchOnWindowFocus:false to all queries
