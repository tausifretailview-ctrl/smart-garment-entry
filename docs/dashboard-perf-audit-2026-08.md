# Dashboard animation & load slowness — Phase 0 read-only audit (2026-08)

> **CLEARED (2026-08-03) — do not re-suspect KPI count-up.**  
> Section 1 shows the stuck mid-screen spinner is `"Still loading… slow network"` from `TabPageFallback` (`TabCachedPages.tsx:360`) — a **React.lazy / Suspense chunk fallback** after 8s, not `useCountUp`. Count-up rAF is finite (~450 ms), scoped to each `DashboardMetricCard`, and **cancelled on cleanup** (`useCountUp.ts:76`). Do **not** “fix” the animation as the nav-slowness root cause.  
> **Next fix class (when implementing):** (1) prefetch destination chunks on nav-item hover/`touchstart`, (2) cut the 8s soft-hint / blank-pane delay, (3) reconsider keeping the old pane mounted-but-`hidden` while the new chunk loads (that is what makes the UI look frozen rather than loading).

Read-only. No `src/` changes. Prior art already established (do not re-derive):

| Doc | What it already settled |
|-----|-------------------------|
| `CURSOR_PROMPT_PERF.md` | Phases 0–2 done; global RQ `staleTime` / `refetchOnWindowFocus: false`; Main Dashboard auto-load gate **Done** |
| `docs/phase-0-query-time-audit-2026-06-26.md` | Server hot queries; `v_dashboard_*` mount cost; product master LATERAL |
| `docs/phase-3-perf-audit-2026-07.md` | Post-trigram shape; `get_customer_segment_counts` vs client OFFSET pager |
| `docs/phase-0-navigation-perf.md` | `__ezzyNavPerf` runbook; chunk vs data-fetch classification |

---

## 1. FIND THE SPINNER (read this first)

### Exact string `"loading network"`

**NOT FOUND** in the repo (case-insensitive search across `src/`, `docs/`, root).

### Nearest match the screenshot almost certainly shows

| Field | Value |
|-------|--------|
| Exact UI copy | `"Still loading… slow network"` |
| File:line | `src/components/TabCachedPages.tsx:360` |
| Component | `TabPageFallback` (`src/components/TabCachedPages.tsx:255–364`) |
| Condition | Active Suspense fallback **and** `showSoftHint === true` (set after **8_000 ms** of foreground elapsed time — `SOFT_LOADING_HINT_MS` at `:201`, applied at `:289`) |
| Visual | Mid-screen CSS spinner (`h-7 w-7 animate-spin …`) at `:358`, hint text below |

### Classification

**(a) React.lazy / Suspense chunk fallback** — not (b) React Query `isLoading`, not (c) a network-status listener, not (d) dashboard metric loading.

Evidence:

- Fallback is wired as `<Suspense fallback={<TabPageFallback … />}>` at `src/components/TabCachedPages.tsx:449–451`.
- Lazy page comes from `getLazyTabPage(path)` → registry loaders like `() => import("@/pages/Index")` (`src/lib/tabPageRegistry.ts:26–27`).
- Soft-hint text is hard-coded under that Suspense path (`:356–362`), independent of any query `isFetching`.
- `useNetworkStatus` / Capacitor `Network` listeners exist (`src/hooks/useNetworkStatus.tsx`, `src/hooks/useOfflineSync.tsx`) but **do not** render this string.

### What the main dashboard itself shows while *its* chunk loads

Main dashboard paths `""` / `"dashboard"` are in `LIST_DASHBOARD_SHELL_PATHS` (`TabCachedPages.tsx:181–194`). For those, `TabPageFallback` returns `DashboardSkeleton` on web (`:317–321`), **not** the “slow network” spinner.

So the client screenshot of a mid-screen spinner + “loading network” wording is the **destination route’s cold chunk Suspense**, typically after leaving the dashboard — not the KPI count-up UI.

### Other near variants (for completeness)

| String | File:line | Role |
|--------|-----------|------|
| `"Loading dashboard…"` | `TabCachedPages.tsx:319`, `Index.tsx:761` | Electron list-dashboard splash / Index status label |
| `"Loading page…"` | `TabCachedPages.tsx:353` | Electron generic Suspense splash |
| `"Syncing…"` | `BackgroundSyncBadge.tsx:52` | Global RQ busy chip in status bar — not mid-screen |
| `"Loading…"` (toolbar) | `Index.tsx:754–755` | Small status text when metrics fetch with no cache |

**Section 1 verdict:** the stuck mid-screen spinner is a **code-splitting / lazy-chunk** surface. Dashboard animation is a possible main-thread *contributor* while that chunk downloads, but it is **not** what paints the spinner.

---

## 2. COUNT-UP ANIMATION

### Implementation

| Question | Answer | File:line |
|----------|--------|-----------|
| Where? | Own hook `useCountUp` | `src/hooks/useCountUp.ts:18–79` |
| Wired into KPI cards by | `DashboardMetricCard` | `src/components/dashboard/DashboardMetricCard.tsx:8,58–62` |
| Used on main dashboard as | `AnimatedMetricCard` alias | `src/pages/Index.tsx:50`, cards at `:869–1071` |
| Library? | None (no countup.js / framer / spring) | — |
| Legacy sibling unused on dashboard | `useAnimatedCounter` defined but **no imports** elsewhere | `src/hooks/useAnimatedCounter.tsx:8`; grep: only that file |

### What drives each tick

`requestAnimationFrame` loop with ease-out-cubic (`useCountUp.ts:63–75`). Not `setInterval`, not CSS, not a spring lib.

### Does each tick call setState?

Yes — `commit` → `setDisplay(v)` (`useCountUp.ts:36–38`, called every rAF frame at `:66`).

State lives **inside the hook / `DashboardMetricCard`**. Parent `Index` is **not** updated per tick. Sibling charts (`StatsChartsSection`) are **not** in the same React state tree as the counter; they only re-render when `Index` itself re-renders (query/permissions/date-range), not on each count-up frame.

### Duration / tick count / how many numbers

| Parameter | Value | File:line |
|-----------|--------|-----------|
| Dashboard card duration | **450 ms** | `DashboardMetricCard.tsx:58–61` |
| Hook default (if unset) | 1100 ms | `useCountUp.ts:4,21` |
| Approx frames @ 60 Hz | ~27 `setDisplay` calls per card per run | derived from 450 ms × rAF |
| Cards on main dashboard | **17** always + **1** optional Gross Profit | `Index.tsx:869–1071` (`canViewGrossProfit` gate `:1037`) |
| Concurrent animated numbers | up to **18** | same |
| Segment tiles (VIP/Regular/…) | **no** count-up — static number or `Loader2` | `Index.tsx:1144–1209` |

### Restart conditions

Effect deps: `[target, durationMs, enabled, reduceMotion, fromPrevious]` (`useCountUp.ts:77`).

| Event | Restarts? |
|-------|-----------|
| First mount / remount | Yes — animates `0 → target` (`fromPrevious` first pass) | `:52–53` |
| `target` changes (refetch with new numbers) | Yes — from previous display → new target when `fromPrevious: true` | `:52`, `DashboardMetricCard.tsx:60` |
| Same `target` again | No — early exit `from === target` | `useCountUp.ts:55–58` |
| Window focus | Not by itself — dashboard queries use `refetchOnWindowFocus: false` | `dashboardQueryOptions.ts:8–15` |
| Route return with pane still mounted | No remount → no restart unless `target` changes | Tab pane `hidden` keep-alive: `TabCachedPages.tsx:470–476` |
| Route return after pane remount | Yes (0 → target) | Electron idle eviction / first open |

`prefers-reduced-motion: reduce` jumps straight to target (`useCountUp.ts:46–49`; media hook `usePrefersReducedMotion.ts:3–18`).

### Cleanup

**Present:** `return () => cancelAnimationFrame(raf)` (`useCountUp.ts:76`).  
An uncancelled forever-loop is **not** supported by this hook once the effect cleans up. While the animation is still running and the pane stays mounted (only `hidden`), rAF continues and still calls `setDisplay` on hidden cards — finite ~450 ms, not unbounded.

---

## 3. CHARTS

### Library / version

| Item | Value | File:line |
|------|--------|-----------|
| Library | **recharts** | `AnimatedChart.tsx:2` |
| Version | **^2.15.4** (resolved **2.15.4** in `node_modules`) | `package.json:172` |

### Every chart on the main dashboard

All via `StatsChartsSection` → `AnimatedChart` (`Index.tsx:1140`, `StatsChartsSection.tsx:135–184`):

| # | Title | Type | File:line |
|---|-------|------|-----------|
| 1 | Sales vs Purchases (Last 7 Days) | `bar` | `StatsChartsSection.tsx:139–148` |
| 2 | Sales Trend (Last 7 Days) | `area` | `:151–159` |
| 3 | Top 5 Products by Stock Quantity | `bar` | `:162–170` |
| 4 | Top 5 Products by Stock Value | `line` | `:173–181` |

### `isAnimationActive`

**Set explicitly** on every series: `isAnimationActive={!reduceMotion}` with `animationDuration={700}` (`AnimatedChart.tsx:95–97`, `:116–118`, `:138–140`).  
Default recharts “ON” still applies whenever reduced-motion is false — i.e. **animation is ON for normal desktop**.

### Memoization / data identity

| Question | Answer | File:line |
|----------|--------|-----------|
| `AnimatedChart` wrapped in `React.memo`? | **No** | `AnimatedChart.tsx:19` (plain function export) |
| `StatsChartsSection` memoized? | **No** | `StatsChartsSection.tsx:13` |
| New data identity each parent render? | **Yes** — `combinedData` is a fresh `.map` every render; `dataKeys={[…]}` literals are new arrays each time | `StatsChartsSection.tsx:124–128`, `:143–146` etc. |
| `CustomTooltip` | Defined **inside** `AnimatedChart` → new component type every render | `AnimatedChart.tsx:28–42` |

### `ResponsiveContainer`

One per chart: `<ResponsiveContainer width="100%" height={height}>` (`AnimatedChart.tsx:162–164`). Not nested. Fixed on parent layout/size changes like any recharts container; no extra resize loop found beyond recharts internals.

---

## 4. WHAT FIRES ON DASHBOARD MOUNT

Auto-load: `setMetricsLoadRequested(true)` when org + Main Dashboard permission ready (`Index.tsx:279–288`). Naming still says “manual” in options, but mount **does** enable fetches (matches `CURSOR_PROMPT_PERF.md` “Main Dashboard auto-load — Done”).

### Query / RPC inventory

| # | What | Key | staleTime / focus / mount | Parallel vs waterfall | File:line |
|---|------|-----|---------------------------|------------------------|-----------|
| 1 | RPC `get_erp_dashboard_stats` | `["dashboard-stats", orgId, startDate, endDate]` | `DASHBOARD_MANUAL_REFRESH_OPTIONS`: `staleTime: Infinity`, `refetchOnMount: false`, `refetchOnWindowFocus: false` | Starts when `metricsQueryEnabled` | `Index.tsx:353–369`; options `dashboardQueryOptions.ts:8–15` |
| 2 | Receivables via `reconcile_customer_balances` (through `fetchOrganizationReceivablesSummary`) | `["organization-receivables","summary", orgId]` | Same manual options when `manualRefreshOnly: true` | **Parallel** with #1 (`enabled: metricsQueryEnabled`) | `Index.tsx:420–423`; hook `useOrganizationReceivablesSummary.ts:32–39`; RPC `organizationReceivables.ts:102–105` |
| 3 | RPC `get_sales_daily_summary` | `["sales-trend", orgId]` | Manual options | Deferred until `auxiliaryMetricsEnabled` | `StatsChartsSection.tsx:18–52` |
| 4 | View `v_dashboard_purchase_summary` select | `["purchase-trend", orgId]` | Manual options | Parallel with #3–5 once deferred gate opens | `StatsChartsSection.tsx:55–91` |
| 5 | `product_variants` top-5 stock | `["top-products", orgId]` | Manual options | Parallel with #3–4 | `StatsChartsSection.tsx:94–121` |
| 6 | RPC `get_customer_segment_counts` | `["customer-segment-counts", orgId]` | Manual options | Parallel with charts after defer | `Index.tsx:441–446`; `customerSegments.ts:242–247` |

### Waterfall / deferral

```
permissions ready
  → metricsLoadRequested = true
  → (#1 stats + #2 receivables) in parallel
  → when displayedDashStats present: requestIdleCallback(enableAux, timeout 2500)
       else fallback enableAux at 5000 ms
  → (#3–#5 charts + #6 segments) in parallel
```

Deferral: `Index.tsx:388–414`. Charts gated by `loadEnabled={metricsLoadRequested && auxiliaryMetricsEnabled}` (`Index.tsx:1140`).

### Sequential deep-OFFSET pagination on main dashboard?

**Not on the Index path.** `fetchCustomerSegmentCounts` uses RPC `get_customer_segment_counts` (`customerSegments.ts:242–247`).

The deep OFFSET loops (`fetchAllCustomerIds` / `fetchAllSalesForSegments`, `PAGE = 1000`, `for (;;)` + `.range(offset, …)` at `customerSegments.ts:33,105–124,129–165`) are used by `fetchCustomerSegmentIndex` (Customer Master / history paths per phase-3 audit) — **not** by `Index.tsx`.

### Login prefetch (before first paint of dashboard)

`prefetchMainDashboardQueries` warms `get_erp_dashboard_stats` for the default month key (`mainDashboardPrefetch.ts:15–35`), called from org-warm path in `OrgLayout.tsx` (import `:43`, idle warm effect around `:200–218`).

---

## 5. NAVIGATION COST — key section

Symptom context: slowness **inside** the app after dashboard has animated; demo org with **zero invoices** → not row-volume.

### Providers / contexts on route change

| Layer | Remounts on dashboard → other page? | File:line |
|-------|-------------------------------------|-----------|
| `PersistQueryClientProvider` / `QueryClient` | Stays mounted | `App.tsx:407–429` |
| `AuthProvider` | Stays | `App.tsx:429` |
| `OrganizationProvider` | Stays | `App.tsx:430` |
| `WindowTabsProvider` | Stays | `App.tsx:432` |
| `OrgLayout` shell / `DesktopAppShell` | Stays | `OrgLayout.tsx:62+` |
| Destination `CachedTabPane` | **Mounts** on first visit; then kept with `className="… hidden"` when inactive | `TabCachedPages.tsx:470–476, 679–693` |
| Dashboard pane when leaving | **Does not unmount** (web): stays mounted, `hidden` | same; web protects all `isTabCachePath` (`:165–168`) |
| Electron idle eviction | May unmount non-protected panes after 120s idle (`ELECTRON_IDLE_UNMOUNT_MS`) | `:42,173–174,539–569` |
| Web idle eviction | Effectively **off** for cacheable tabs — `isProtectedTabPath` true for every `isTabCachePath` | `:165–168` |

### Which queries refetch on navigate away / back?

Main dashboard keys use `refetchOnMount: false`, `refetchOnWindowFocus: false`, `staleTime: Infinity` (`dashboardQueryOptions.ts:8–15`).  
**Returning to dashboard within the cached pane does not refetch** those keys unless the user hits Refresh (`Index.tsx:333–349`).

Destination pages use their own options (often global default `staleTime: 60_000`, `refetchOnMount` default true — `App.tsx:382–386`). First visit = cold fetch **and** cold chunk.

### Animation / timer cleanup when leaving dashboard

| Resource | Cleanup? | File:line |
|----------|----------|-----------|
| Count-up rAF | **Yes** — `cancelAnimationFrame` on effect cleanup | `useCountUp.ts:76` |
| Auxiliary idle / timeout | **Yes** — `cancelIdleCallback` / `clearTimeout` | `Index.tsx:398–412` |
| Query-cache subscription | **Yes** — unsubscribe return | `Index.tsx:320–329` |
| Tab scroll restore rAF/timeout | **Yes** | `TabCachedPages.tsx:431–434` |
| Idle tab eviction interval | Cleared on `TabCachedPages` unmount | `:608–609` |
| Recharts internal timers | Owned by recharts; pane stays mounted (hidden) on web — charts remain in memory | `AnimatedChart.tsx:162–164` |

**Explicit absence:** there is **no** unbounded dashboard `setInterval` driving KPI animation. The “animation loop follows you around the app” hypothesis is **weak** for count-up (finite + cancelled). A stronger in-process cost is: **hidden dashboard tree stays alive on web** (18 cards + 4 ResponsiveContainers) while a **new route’s JS chunk** downloads under Suspense.

### Is the route lazily chunked? Chunk size?

| Item | Answer | File:line |
|------|--------|-----------|
| Lazy? | **Yes** — `""` / `dashboard` → `import("@/pages/Index")` | `tabPageRegistry.ts:26–27` |
| Destination routes | Same pattern per registry entry | `tabPageRegistry.ts` throughout |
| Built gzip/kB size of Index chunk in this checkout | **NOT FOUND** — no `dist/assets` build artifact present to measure | — |
| Source weight (context only) | `Index.tsx` ≈ 49 KB source; dashboard helpers ≈ 22 KB combined | `wc` on those paths |

Post-login web prefetch list is **slim** and does **not** warm every navigable page (`POST_LOGIN_PREFETCH_TAB_PATHS_WEB` in `chunkLoadRetry.ts:44–52` — POS/purchase dashboards/stock only). Idle inventory warm adds product/purchase entry paths (`:59–68`). Navigating to e.g. Customers / Accounts / Payments / Settings after sitting on the main dashboard commonly hits a **cold dynamic import** → `TabPageFallback` → after 8s `"Still loading… slow network"`.

---

## 6. EXISTING INSTRUMENTATION — `window.__ezzyNavPerf`

| Item | Detail | File:line |
|------|--------|-----------|
| Defined / exposed | `exposeApi()` assigns `window.__ezzyNavPerf` | `navigationPerfDiagnostics.ts:446–457` |
| Enable | `localStorage ezzy_nav_perf=1` or `?navperf=1` | `:165–174`; header comment `:4–10` |
| Init call site | Used from app boot / panel (see `NavigationPerfPanel.tsx`, `OrgLayout.tsx:34–38,251–264`) | — |

### API surface

`enabled`, `enable`, `disable`, `getEvents`, `getTransitions`, `getSnapshot`, `printReport`, `copyReport`, `buildReport` (`:447–456`).

### What `copyReport()` emits

`copyReport` → `copyNavPerfReport` → clipboard text from `buildNavPerfReport()` (`:436–443`, `:383–429`):

1. Header `=== EzzyERP Navigation Perf Report (Phase 0) ===` + ISO timestamp  
2. **Environment:** `electron`, `electronSingleTab`, `connection` (Network Information `effectiveType`)  
3. **Current snapshot:** `activePath`, `renderPath`, `mountedTabs`, `openTabs`  
4. **Recent transitions** (last 10): `from → to`, `totalMs`, `[classification]`, `render=`, `chunk=` ms, `data=` ms, `remount=`, `loadingUi=`  
5. Nested event lines for `data-fetch-end` / `chunk-load-end` / `loading-ui`  
6. **Raw events** (last 30): type, ts, path, label, duration  

Event types enumerated at `:19–30`. Transition classification values at `:54`.

---

## 7. BLOCKING LOADERS (dashboard-adjacent only)

Full-page / panel-blocking `Loader2` **instead of shell-first**, limited to routes a user typically opens from / around the main dashboard. Not a repo-wide ~30 count.

| Page | Pattern | File:line | Notes |
|------|---------|-----------|-------|
| **Sales Analytics** (customer segment cards navigate here) | Full workspace center spinner while `salesLoading` | `SalesAnalyticsDashboard.tsx:415–422` | Blocks entire page |
| **Quotation Dashboard** | Table-panel center `Loader2` while `isLoading` | `QuotationDashboard.tsx:473–476` | Shell chrome may show; table blank |
| **Delivery Challan Dashboard** | Same table-panel blocker | `DeliveryChallanDashboard.tsx:407–410` | |
| **Purchase Order Dashboard** | Card body center spinner | `PurchaseOrderDashboard.tsx:435–438` | |
| **Net Profit** (toolbar button on Index) | Full flex center spinner | `NetProfitAnalysis.tsx:137–140` | Dashboard-adjacent |
| **Sale Order Dashboard** | `Loader2` in print dialog only | `SaleOrderDashboard.tsx:1306–1309` | Not full-page list gate |
| **Purchase / Product / POS / Sales Invoice dashboards** | Shell-first already (Phase 1/2) — inline action spinners only | e.g. `PurchaseBillDashboard`, `ProductDashboard` | Out of “still blocking” set |
| **Main Index** | No full-page Loader2 gate; placeholders / skeletons / small toolbar spinner | `Index.tsx:738–762,806–807` | Aligns with shell-first |

Suspense chunk fallbacks (`TabPageFallback`) are a **separate** blocking class — see §1 — and affect **any** cold tab not given a list/entry shell.

---

## 8. VERDICT

### Primary: **NETWORK / FETCH SHAPE of the *navigation* path = lazy **chunk** download** (code-splitting), not KPI arithmetic over invoices

Justification from §§1–5 (not intuition):

1. **§1** — The only mid-screen copy matching the report is Suspense’s `"Still loading… slow network"` (`TabCachedPages.tsx:360`), gated by chunk-load time ≥ 8s, not by React Query.
2. **Zero-invoice demo** — KPI RPCs and charts still run, but empty data cannot explain an 8s Suspense hint; a **cold JS chunk** can.
3. **§2** — Count-up rAF **is cancelled** and lasts **450 ms × ≤18 cards**, with setState **scoped to each card**. It can add main-thread contention **during** the first half-second of a transition if the user navigates mid-animation, but it does **not** produce the stuck spinner and does **not** keep running forever.
4. **§3** — Recharts animation (700 ms, `isAnimationActive` on) and unstable `data` / `dataKeys` / inline `CustomTooltip` identities are real main-thread cost on dashboard mount/refresh, but they live on the dashboard tree; they don’t render the Suspense spinner on the next route.
5. **§5** — Web keeps the dashboard pane mounted (`hidden`); providers stay up; dashboard queries do **not** refetch on focus/mount. The expensive part of “click away” is **first-time `import()` of the destination** (+ that page’s own initial queries), which is exactly when `TabPageFallback` shows.

**Evidence is slightly mixed** on whether animation *worsens* perceived jank in the first ~1s of navigation (hidden dashboard + chart SVG work overlapping chunk parse). It is **not** mixed on what the stuck spinner **is**: lazy-chunk Suspense.

Secondary (main-thread) contributors when still on / returning to the dashboard: 18× count-up + 4× animated recharts with poor memoization (§§2–3).

### Candidate fixes (ranked by impact ÷ regression risk) — **do not implement here**

**Do not rank count-up changes as the nav fix.** Animation polish is optional polish only after chunk UX is fixed.

| Rank | Candidate | Touches | Impact ÷ risk |
|------|-----------|---------|----------------|
| 1 | Prefetch destination chunks on nav-item **hover / `touchstart`** (sidebar, header, Index metric cards, command palette) so click rarely cold-loads | `tabPageRegistry.ts` (`prefetchTabPage`), nav chrome / `Index.tsx` | High ÷ Low |
| 2 | Cut the **8s** blank Suspense wait: lower `SOFT_LOADING_HINT_MS` and/or show an immediate named shell (“Opening Customers…”) instead of a bare spinner that only later admits “slow network” | `TabCachedPages.tsx:200–201,356–362` | High ÷ Low — this *is* the felt symptom |
| 3 | Reconsider **mounted-but-`hidden` old pane** during first chunk load of the destination — overlap looks frozen; prefer showing destination shell/fallback as the only visible surface (keep cache *after* first paint) | `TabCachedPages.tsx:470–476`, `OrgLayout.tsx` tab-cache/Outlet handoff | High ÷ Med |
| 4 | Broaden idle / post-login web prefetch to real post-dashboard destinations (customers, accounts, payments, …) | `chunkLoadRetry.ts` web idle lists | High ÷ Low |
| 5 | Extend `LIST_DASHBOARD_SHELL_PATHS` / skeletons to high-traffic non-shell tabs | `TabCachedPages.tsx:183–194` | Med–High ÷ Low |
| 6 | *(Optional, not root cause)* stabilize recharts props / shorten chart animation on dashboard refresh | `AnimatedChart.tsx`, `StatsChartsSection.tsx` | Low–Med ÷ Low |
| 7 | Sales Analytics / Quotation / DC / PO shell-first table loaders | respective dashboards | Med ÷ Low |
| 8 | Measure chunk kB + `__ezzyNavPerf` `classification: chunk` on demo org before further splits | build / `navigationPerfDiagnostics.ts` | Info ÷ None |

### Suggested measurement (no code)

```js
localStorage.setItem('ezzy_nav_perf', '1');
location.reload();
// Open main dashboard, wait for count-up + charts, then click Customers / Payments / Accounts
await window.__ezzyNavPerf.copyReport();
```

Expect `classification: chunk` and `loadingUi=yes` on first navigation; `chunkLoadMs` correlating with the Suspense spinner — confirming §1 over animation-as-root-cause.
