# Cursor prompt — performance handoff

**Phases 0–2 are done** for loading, connection resilience, inventory shell-first, and core cloud savings.  
Continue work only on **P3/P4** below — **no business-logic or schema changes** without explicit approval.

| Phase | Doc | Status |
|-------|-----|--------|
| 0 | `docs/phase-0-navigation-perf.md` | Measurement runbook |
| 1 | `docs/phase-1-shell-loading.md` | **Done** |
| 2 | `docs/phase-2-cloud-savings.md` | **Done** |

---

## Completed hotspots (do not re-fix)

| Issue | File | Status |
|-------|------|--------|
| Dashboard manual load gate | `Index.tsx` | **Done** |
| Tab reload storm | `TabCachedPages.tsx`, `tabPageRegistry.ts` | **Done** |
| Purchase Entry blank screen | `OrgLayout.tsx` | **Done** |
| Inventory shell-first | `PurchaseBillDashboard`, `ProductDashboard`, `PurchaseReturnDashboard`, `StockAdjustment` | **Done** |
| Purchase tab + Excel persistence | `PurchaseEntry.tsx`, PR #50 | **Done** |
| StatusBar due scan | `StatusBar.tsx` | **Done** |
| Org sync / fetch timeout | `OrgLayout.tsx`, `OrganizationContext.tsx` | **Done** |
| Route lazy blank | `App.tsx` | **Done** |
| Floating chrome defer | `IdleMount.tsx` | **Done** |
| POS Dashboard tab return | `POSDashboard.tsx` → `useQuery` + 30s stale | **Done** |
| Accounts header RPC | `Accounts.tsx` → `get_accounts_dashboard_metrics` | **Done** |
| Shared ledger cache | `useOrgLedgerReferenceData.ts` | **Done** |
| Quick Payments picker | `customerPaymentPickerList.ts`, `FloatingPayments.tsx` | **Done** |

---

## React Query rules (must follow)

- Global: `staleTime: 30_000`, `refetchOnWindowFocus: false` in `App.tsx`
- Tab return: `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` from `dashboardQueryOptions.ts`
- **staleTime: 0** only for search/filter in `queryKey` or POS barcode keys
- Paginated lists: `STALE_PAGINATED` (5s) unless search in key
- Settings: `useSettings()` / `STALE_SETTINGS`
- Do **not** disable `refetchOnMount` globally

---

## Do NOT change

- `src/integrations/supabase/client.ts`, `types.ts`, `.env`
- Hand-edit existing `supabase/migrations/*`
- Payment/balance: `computeCustomerOutstanding` only
- Receipt `reference_type`: `CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES` only

---

## P3 — Optional shell / chunk (low cloud impact)

- [ ] Bulk Product Update — shell while org loads (UI only)
- [ ] Purchase Orders — table skeleton vs center spinner
- [ ] Barcode Printing — static shell while settings load
- [ ] Split heavy routes: `Accounts`, `Settings`, `BarcodePrinting` via `import()` (chunk only)

---

## P4 — Query / DB (measure first)

- [ ] `MobileDashboard.tsx`: duplicate `get_erp_dashboard_stats` where safe
- [ ] Sales Dashboard: single stats source vs dual scan (`app-loading-slowness-diagnosis.md`)
- [ ] `EXPLAIN ANALYZE` on heavy RPCs for large orgs — **new migration only if index gap**

---

## Acceptance checklist (regression)

1. Main Dashboard metrics on first visit without **Load Data**
2. Purchase Bills ↔ Purchase Entry — no blank screen; form state kept
3. Purchase Returns / Stock Adjustment — shell visible; no full-page blocker
4. Window tab switch within 30s — previous rows visible; minimal Supabase
5. `npm run build` exits 0
6. Customer search + POS barcode still refetch on change (`staleTime: 0`)

Verify with:

```js
localStorage.setItem('ezzy_nav_perf', '1');
// optional:
localStorage.setItem('ezzy_cloud_usage', '1');
location.reload();
```
