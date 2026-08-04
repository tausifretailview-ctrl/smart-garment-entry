# Web nav loading — implementation notes (2026-08)

Follows `docs/dashboard-perf-audit-2026-08.md` (PR #224). Count-up animation is **CLEARED** — not revisited.

Core shell + sidebar `NavLink` intent prefetch landed earlier (PR #225). This pass adds menubar/header/window-tab intent gaps, idle-prefetch yielding, and the Step 1 / 4 / 5 measurements below.

---

## Step 1 — Prefetch race (gating)

**Method:** Production `npm run build` chunk sizes (gzip level 9), Chrome DevTools **Fast 3G** model (1.6 Mbps ≈ 200 KB/s, 150 ms RTT). Authenticated Fast 3G UI timing was **not** available in this cloud environment (no demo credentials against production).

**Web critical list** (`POST_LOGIN_PREFETCH_TAB_PATHS_WEB`): `""`, `pos-sales`, `pos-dashboard`, `sales-invoice-dashboard`, `purchase-bills`, `purchase-bill-dashboard`, `stock-report`.

Note: `purchase-bills` ↔ `purchase-bill-dashboard` alias to the **same** chunk (`PurchaseBillDashboard`), so the unique page-chunk set is 6 modules.

| Path | gzip (page chunk) | Solo Fast 3G |
|------|-------------------|--------------|
| dashboard (`Index`) | ~13.8 kB | ~0.22 s |
| pos-sales | ~49.4 kB | ~0.40 s |
| pos-dashboard | ~24.6 kB | ~0.28 s |
| sales-invoice-dashboard | ~35.9 kB | ~0.33 s |
| purchase-bill-dashboard (+ purchase-bills alias) | ~18.9 kB | ~0.25 s |
| stock-report | ~16.3 kB | ~0.23 s |
| **Sum (unique)** | **~159 kB** | **~0.96 s wall if H2 multiplexed from t=0** |

### a) Login → critical chunks resolve

Web `OrgLayout` calls `prefetchPostLoginCriticalPages()` **immediately** once org is synced and the tab pane is ready (no `POST_LOGIN_PREFETCH_DEFER_MS`, no idle gate). All paths `forEach(prefetchTabPage)` in parallel.

**Estimate:** ~1.0 s after warm-start of critical prefetch for the cohort to finish on Fast 3G (page chunks only). Cold login also competes with remaining vendors / PWA precache (~10 MB workbox list) and RQ dashboard prefetches — real wall clocks can stretch multi-seconds, but the **page-chunk cohort alone** is sub-2s.

### b) vs realistic time-to-first-navigation (3–5 s)

Assuming staff click 3–5 s after the app is interactive:

| Click at | Critical page chunks still in flight? |
|----------|----------------------------------------|
| 3 s | **No** (page-chunk model) — race **won** for the slim list |
| 5 s | **No** |

**Implication:** Coverage of `sales-invoice-dashboard` in the web critical set is **not** the whole story for “stuck on navigate.” Felt stuck was dominated by (1) bare spinner until 8 s, (2) no intent warm on menubar/Settings/User Rights, (3) contention from parallel idle + other downloads — not “missing from the list.”

### c) `beginUserPriorityLoad` / `pauseBackgroundPrefetch`

| Question | Answer |
|----------|--------|
| Does tab navigation call `beginUserPriorityLoad`? | **Now yes** (this PR) when the destination chunk is not yet loaded |
| Does that **abort** in-flight web-critical `import()`s? | **No** — promises already in `prefetchCache` keep downloading |
| Does it pause **idle** sequential warm? | **Yes** — idle list now uses `scheduleSequentialIdlePrefetch` + `isBackgroundPrefetchAllowed` |
| Does web critical warm check the gate? | **No** — still fire-and-forget parallel (by design for the slim set) |

**Priorities:** Intent prefetch + immediate shells matter more than widening the critical list. Widening would add parallel bytes against the route the user just clicked (Settings / User Rights).

---

## Step 2 — Sidebar / nav intent prefetch

| Surface | Mechanism |
|---------|-----------|
| `AppSidebar` | All items are `NavLink` → mouseenter/focus speculative; pointerdown/touchstart **intent** (PR #225) |
| `WindowTabsBar` | mouseEnter + pointerDown intent (PR #225) |
| `Header` / `HeaderMenubar` | This PR: pointerdown intent on Settings, User Rights, and other menubar/toolbar destinations |
| `WindowTabsContext` open/switch | This PR: `{ intent: true }` so Save-Data/2g cannot skip a real open |
| Click path | `getLazyTabPage` → `loadTabPageModule` reuses the **same** `prefetchCache` promise — no second import |

Speculative path respects Save-Data / `effectiveType` 2g via `shouldAllowSpeculativeChunkPrefetch`. Prefetch `.catch` is silent (no toast, no `attemptSkewRecoveryReload`).

---

## Step 3 — Immediate shell

Every `TAB_PAGE_REGISTRY` key maps to an existing shell (`entry` → `AppBootSplash` “Loading bill screen…”, else `DashboardSkeleton` / page splash). Soft hint `"Still loading… slow network"` is **second-stage only** (8 s). Hard timeout card unchanged (20 s / 45 s heavy).

**Outgoing pane:** stays **mounted**. While the destination chunk loads, the previous pane is shown **dimmed** (`opacity-40`, `saturate-50`, `pointer-events-none`) under the incoming shell — chosen so half-typed bills survive tab switches and the transition is visible (not a frozen “same screen”).

---

## Step 4 — Web-slim vs Electron + widen recommendation

### Exact list diff

**Web critical:** `""`, `pos-sales`, `pos-dashboard`, `sales-invoice-dashboard`, `purchase-bills`, `purchase-bill-dashboard`, `stock-report`

**Electron critical adds:** `sales-invoice`, `purchase-entry`, `customers`, `suppliers`, `product-dashboard`, `product-entry`, `purchase-return-entry`, `sale-return-dashboard`, `purchase-return-dashboard`, `accounts`, `products`, `purchase-returns` (aliases overlap)

**Web idle inventory:** product/purchase dashboards + `purchase-entry` + `product-entry`

**Electron idle (not on web idle):** `settings`, `user-rights`, `audit-log`, `barcode-printing`, plus a long reports/admin list

### Proposed widen (DO NOT merge blind) — **recommend against**

| Candidate | gzip page chunk | Why tempting | Why not |
|-----------|-----------------|--------------|---------|
| settings | ~33 kB | Live shop stuck | Intent + shell fix the UX; +33 kB parallel with critical worsens contention |
| user-rights | ~5 kB | Live shop stuck | Tiny, but entered from Settings/menubar — intent covers it |
| Full electron critical extras | **~221 kB gz** | Parity | Doubles+ the warm cohort; Step 1 says slim set already finishes before 3–5 s clicks — more parallel makes the race **worse** for off-list clicks |

**Recommendation:** Keep web critical slim. Rely on intent prefetch + shells. Optionally (future) add **sequential** deferred warm of `settings` alone after critical finishes — not a parallel widen.

---

## Step 5 — Top 10 route chunks (no splits)

From `npm run build` (page chunks; vendors listed for context only):

| Rank | Chunk | raw / gzip | Dominated by |
|------|-------|------------|--------------|
| 1 | BarcodePrinting | ~315 / 80 kB | Label UI + JsBarcode; jsPDF/html2canvas share `pdf-vendor` (related to route — **no mis-import fix**) |
| 2 | PurchaseEntry | ~193 / 52 kB | Full purchase bill screen |
| 3 | POSSales | ~186 / 51 kB | POS (out of scope) |
| 4 | Accounts | ~164 / 39 kB | Accounts module UI |
| 5 | SalesInvoiceDashboard | ~136 / 36 kB | Invoice list dashboard |
| 6 | Settings | ~154 / 33 kB | Large settings surface (panels already lazy inside) |
| 7 | SalesInvoice | ~113 / 31 kB | Sale entry |
| 8 | CustomerLedger | ~141 / 30 kB | Ledger UI |
| 9 | POSDashboard | ~97 / 25 kB | POS dashboard |
| 10 | StockSettlement | ~83 / 22 kB | Settlement UI |

Shared vendors (not route-split here): `pdf-vendor` ~384 kB gz, `xlsx-vendor` ~142 kB gz, `chart-vendor` ~112 kB gz.

**Mis-import exception:** none fixed — no unrelated route was found pulling print/chart/PDF into the wrong chunk.

---

## Verification matrix

Environment: cloud agent — **no authenticated org session**. Code-path verification + unit tests only. Fast 3G browser matrix: **NOT RUN** (mark for shop QA).

| Route (from dashboard) | Shell &lt;150 ms (code) | Interactive (Fast 3G) | 8 s hint | Hover warm 1 s then click |
|------------------------|------------------------|------------------------|----------|---------------------------|
| sales-invoice-dashboard | DashboardSkeleton | NOT RUN | NOT RUN | NOT RUN |
| pos-sales | entry splash | NOT RUN | NOT RUN | NOT RUN |
| purchase-bills | DashboardSkeleton | NOT RUN | NOT RUN | NOT RUN |
| stock-report | DashboardSkeleton | NOT RUN | NOT RUN | NOT RUN |
| pos-dashboard | DashboardSkeleton | NOT RUN | NOT RUN | NOT RUN |
| settings | DashboardSkeleton | NOT RUN | NOT RUN | CODE: menubar/header intent |
| user-rights | DashboardSkeleton | NOT RUN | NOT RUN | CODE: Tools menubar + Settings CTA intent |

| Check | Result |
|-------|--------|
| Rapid 5-route click does not double-import | CODE OK — `prefetchCache` dedupes |
| Prefetch failure → skew reload | CODE OK — silent `.catch`; skew only via error boundaries / `importWithRetry` path |
| Outgoing pane stays mounted | CODE OK — dim overlay, not unmount |
| Thresholds unchanged | CODE OK — still 8 s / 20 s / 45 s |
