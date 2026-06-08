# Phase 1 — Shell-first loading & tab cache (DONE)

**Goal:** Open pages like offline Windows software — **static shell first**, data loads silently.  
**Constraint:** UI / routing / React Query cache only — **no new Supabase queries**, no balance formula changes, no schema edits.

Status: **Complete** for core navigation, connection resilience, and inventory dashboards (June 2026).

---

## Design rules (unchanged)

| Rule | Where |
|------|--------|
| Global `staleTime: 30_000`, `refetchOnWindowFocus: false` | `src/App.tsx` |
| Tab-return cache: `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` | `src/lib/dashboardQueryOptions.ts` |
| `refetchOnMount: false` **only** on tab-return dashboards (not global) | same file |
| Live search / barcode: `staleTime: 0` when term in `queryKey` | `src/lib/queryStaleTimes.ts` |
| Multi-tenant: every query scoped by `organization_id` | RLS + app code |

**Cloud impact:** Tab-return options **reduce** reads on window-tab switch (30s TTL + `placeholderData`). Shell-first UI adds **zero** API calls.

---

## Completed — infrastructure

| Item | File(s) | What it does |
|------|---------|--------------|
| Tab reload storm fix | `TabCachedPages.tsx`, `tabPageRegistry.ts` | Only active tab mounts on cold reload; idle prefetch for other open tabs |
| Org sync fail-open | `OrgLayout.tsx` | 4s timeout → render anyway (no infinite spinner) |
| Org fetch resilience | `OrganizationContext.tsx` | 20s timeout; cached org list fallback on slow WebView |
| Route lazy fallback | `App.tsx` | `DashboardSkeleton` instead of blank screen |
| Deferred chrome | `IdleMount.tsx` | PWA banner / chat / WhatsApp after first paint |
| Main dashboard auto-load | `Index.tsx` | Metrics load when org is set (no manual **Load Data**) |
| StatusBar consolidation | `StatusBar.tsx` | `v_dashboard_receivables` + `v_dashboard_stock_summary` (one query key) |
| NavPerf diagnostics | `navigationPerfDiagnostics.ts`, `useNavigationPerf.tsx` | Tab switch / chunk / data-fetch timing |
| Chunk retry + prefetch tiers | `chunkLoadRetry.ts` | Web slim post-login list; inventory idle prefetch; Electron full list |
| Purchase Entry blank screen | `OrgLayout.tsx` | Cacheable entry renders via tab cache (not hidden Outlet + hidden cache) |
| Purchase Entry tab persistence | `PurchaseEntry.tsx`, PR #50 | Excel import flushed before tab switch; session snapshot on unmount |

---

## Completed — shell-first inventory pages

| Page | Path | Pattern |
|------|------|---------|
| Purchase Bills | `purchase-bills` / `purchase-bill-dashboard` | Layout immediate; `ERPTable` skeleton; `DASHBOARD_TAB_RETURN` |
| Products | `products` / `product-dashboard` | Same |
| Purchase Returns | `purchase-returns` / `purchase-return-dashboard` | Removed full-page blocker; table skeleton rows |
| Stock Adjustment | `stock-adjustment` | Same |
| Purchase Entry | `purchase-entry` | Entry shell fallback during chunk load; tab-cached with bills/products |

**Tab chunk shells** (`TabCachedPages.tsx` `TabPageFallback`):

- Dashboard list routes → `DashboardSkeleton`
- `purchase-entry` → dark header + table shell (`EntryTabShellFallback`)
- Inventory idle prefetch warms purchase/product/return chunks without blocking visible tab

---

## Completed — sales / POS tab return

| Page | Change | Cloud impact |
|------|--------|--------------|
| POS Dashboard | `useQuery` + `STALE_DASHBOARD_TAB_RETURN` (30s) | **Fewer** refetches on tab return vs old `fetchSales()` every visit |
| Sales Invoice Dashboard | `STALE_DASHBOARD_TAB_RETURN` on unified stats query | **Fewer** refetches within 30s |
| Product / Purchase dashboards | `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` | **Fewer** list + summary refetches on tab switch |

---

## Verify with NavPerf (Phase 0 runbook)

Re-run test script after deploy. Expect:

| Transition | Pass criteria |
|------------|---------------|
| Purchase Bills ↔ Purchase Entry | `render=tab-cache`, **no blank blue screen**, `remount=no` |
| Purchase Bills ↔ Products (30s) | `data-fetch` skipped or &lt;50ms; previous rows visible |
| Purchase Returns first open | `spinner=no` (full-page); layout visible; table skeleton only |
| Stock Adjustment first open | Same |
| Reload with 5+ window tabs | Only active tab mounts; others on first switch |
| Alt-tab back | No extra Supabase burst (`refetchOnWindowFocus: false`) |

```js
localStorage.setItem('ezzy_nav_perf', '1');
location.reload();
// after testing:
await window.__ezzyNavPerf.copyReport();
```

---

## Remaining (Phase 1 — optional, same pattern only)

Do **not** change business logic — only apply shell-first + `DASHBOARD_TAB_RETURN` where missing:

| Page | Current gap |
|------|-------------|
| Bulk Product Update | Full-page spinner until org loads |
| Purchase Orders | Table-center `Loader2` only |
| Barcode Printing | Blocks on settings load |
| Stock Report / Analysis | Mixed manual fetch; no tab-return cache |

---

## Do NOT change

- Payment/balance: `computeCustomerOutstanding` only
- Receipt `reference_type`: `CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES` only
- `src/integrations/supabase/client.ts`, `types.ts`, `.env`
- Hand-edit existing `supabase/migrations/*`
