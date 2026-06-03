# Cursor prompt — performance (cold load + dashboard)

Paste this into Cursor when continuing perf work (P2–P4).

## Validated hotspots

| Issue | File | Notes |
|-------|------|--------|
| Dashboard gated on manual load | `src/pages/Index.tsx` | **Fixed (P0):** removed `hasLoaded`; queries run when `currentOrganization?.id` is set |
| Tab reload storm | `src/components/TabCachedPages.tsx` | **Fixed:** only active tab mounts on reload; `prefetchTabPagesIdle` in `src/lib/tabPageRegistry.ts` |
| StatusBar due scan | `src/components/StatusBar.tsx` | **Fixed (P1):** `v_dashboard_receivables` + `v_dashboard_stock_summary`, one query key |
| Org sync spinner | `src/components/OrgLayout.tsx` | **Fixed (P1):** 4s fail-open timeout |
| Org fetch timeout | `src/contexts/OrganizationContext.tsx` | **Fixed (P1):** 6s timeout; refresh session only if JWT expires within 5 min |
| Route lazy blank | `src/App.tsx` | **Fixed (P1):** `LazyFallback` uses `DashboardSkeleton` |
| Floating chrome | `src/components/IdleMount.tsx` | **Fixed (P1):** PWA/chat/WhatsApp deferred in layouts |

## React Query rules (must follow)

From `.cursor/rules/react-query-cache.mdc`:

- Global: `staleTime: 30_000`, `refetchOnWindowFocus: false` in `src/App.tsx`
- **staleTime: 0** only for search/filter in `queryKey` or POS barcode keys
- Paginated lists: `STALE_PAGINATED` (5s) unless search in key
- Reference data: `useOrgQuery` + `STALE_REFERENCE` from `src/lib/queryStaleTimes.ts`
- Settings: `useSettings()` / `STALE_SETTINGS`
- Do **not** disable `refetchOnMount` globally

## Do NOT change

- `src/integrations/supabase/client.ts`, `types.ts`, `.env`
- Do not hand-edit existing `supabase/migrations/*` (new timestamped migrations only; Lovable applies)
- Payment/balance: use `computeCustomerOutstanding` in `customerBalanceUtils.ts` only; never invent balance formulas
- Receipt `reference_type`: `CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES` only

## P2 — Chunk hygiene (follow-up)

- [ ] Split heavy routes: `Accounts`, `Settings`, `BarcodePrinting`, school modules via `import()`
- [ ] Audit `lazyWithRetry` eager prefetch on nav hover
- [ ] Optional `PageSkeleton` for non-dashboard routes

## P3 — Query consolidation (follow-up)

- [ ] `MobileDashboard.tsx`: collapse duplicate `get_erp_dashboard_stats` (today + month) where safe
- [ ] Migrate repeated org reference fetches to `useOrgQuery`

## P4 — DB (follow-up)

- [ ] `EXPLAIN ANALYZE` on `get_erp_dashboard_stats` for large orgs
- [ ] Profile `v_dashboard_receivables` / `v_dashboard_stock_summary`
- [ ] New migration only if index gap found (`idx_sales_org_date` may already exist)

## Acceptance checklist

1. Main Dashboard shows metrics on first visit without **Load Data**
2. Reload with many window tabs: only active tab mounts; others on first switch
3. StatusBar **Due** aligns with dashboard receivables (same view source)
4. `npm run build` exits 0
5. Customer search + POS barcode still refetch on change (`staleTime: 0`)
