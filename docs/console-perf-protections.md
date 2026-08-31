# Console performance protections

Investigation date: 2026-08-31.

Speed and loading recovered after the last console-related cleanup. This note
is the layer that keeps the same class of mistake from shipping again.

## What went wrong

Chrome DevTools (and some remote inspectors) serialize `console.log` /
`console.info` arguments on the **main thread**. A quiet loop that is cheap
in production becomes a hitch every time DevTools is open.

The proven incident:

| When | Commit | What |
|------|--------|------|
| 2026-04-22 | `fb649cbaf` / `d5ec688c6` | Removed 17 `console.log(\`Fetched ${allRows.length}…\`)` from `src/utils/fetchAllRows.ts` (customers, sales, products, vouchers, variants, sale items, purchase items). Those helpers run on POS, dashboard, and ledger load. |

That was the classic “console made the app slow” fix. The logs were not
needed for operators; they existed for development convenience.

## Residual risk found in this pass (now gated)

Always-on `console.info` was still writing on every interesting frame:

| Probe | Trigger | Was | Now |
|-------|---------|-----|-----|
| `src/lib/mainThreadViolationProbe.ts` | Persist restore + every `longtask` ≥ 50ms | `console.info` always | In-memory always; console only if `ezzy_main_thread=1` or `?mainthread=1` |
| `src/lib/pwaColdOpenDiagnostics.ts` | OrgLayout snapshot + every tab chunk start/resolve | `console.info` always | In-memory always; console only if `ezzy_pwa_cold_open=1` or `?pwacold=1` |
| `src/App.tsx` → `initCloudUsageDiagnostics()` | App boot | Called when `import.meta.env.DEV` **or** flag | Flag / `?cloudusage=1` only. The wrapper itself already no-ops without the flag; DEV-always was a footgun for the next edit. |

Correctly opt-in already (do not change):

- NavPerf: `ezzy_nav_perf` / `?navperf=1` — `src/lib/navigationPerfDiagnostics.ts`

In-memory dump (no flag, user types it):

- `window.__ezzyMainThread.print()`
- `window.__ezzyColdOpen.print()`
- `window.__ezzyNavPerf.printReport()`
- `window.__ezzyCloudUsage.printReport()`

## Already quiet (must stay quiet)

These files have no `console.log` / `console.info` on the happy path. Errors
and warnings stay allowed.

- `src/pages/POSSales.tsx`
- `src/pages/POSDashboard.tsx`
- `src/pages/Index.tsx`
- `src/lib/posBilling/cartMutators.ts`
- `src/lib/posCartPersistence.ts`
- `src/hooks/usePosBilling.ts`
- `src/utils/saleSettlement.ts`
- `src/utils/customerBalanceUtils.ts` / `customerBalanceCore.ts`
- `src/utils/fetchAllRows.ts` (`console.error` on fetch failure only)
- `src/lib/queryPersister.ts`

## Protection layers

Four independent checks so one missed review does not reintroduce the hitch.

### 1. Cursor rule (authors)

`.cursor/rules/console-hot-paths.mdc` — always applied. Agents and humans
see it before editing POS / fetch / settlement files.

### 2. Helper (runtime)

`src/lib/diagConsole.ts` — `isDiagConsoleEnabled` / `diagConsoleInfo`.
New probes must go through this. Do not add a second “always log” helper.

### 3. CI script (merge gate)

```bash
npm run check:console-guard
```

`scripts/check-hot-path-console.mjs` fails if:

- A hot-path file gains `console.log` / `info` / `debug` / `time`
- A probe file calls `console.info` instead of `diagConsoleInfo`
- `App.tsx` auto-enables cloud-usage diagnostics with `import.meta.env.DEV`

Wired in `.github/workflows/ci.yml`.

### 4. Vitest (same rules, runs with `npm test`)

- `src/lib/hotPathConsole.guard.test.ts` — file scans
- `src/lib/diagConsole.test.ts` — flag off by default
- Probe tests assert `console.info` is not called without the flag

## How to use probes after this change

Enable **one** flag, reload, capture, then **remove** the key.

```js
localStorage.setItem("ezzy_nav_perf", "1");
localStorage.setItem("ezzy_cloud_usage", "1");
localStorage.setItem("ezzy_main_thread", "1");
localStorage.setItem("ezzy_pwa_cold_open", "1");
location.reload();
```

Or query: `?navperf=1` `?cloudusage=1` `?mainthread=1` `?pwacold=1`

Dump without enabling console spam:

```js
window.__ezzyMainThread.print();
window.__ezzyColdOpen.print();
```

When finished:

```js
localStorage.removeItem("ezzy_nav_perf");
localStorage.removeItem("ezzy_cloud_usage");
localStorage.removeItem("ezzy_main_thread");
localStorage.removeItem("ezzy_pwa_cold_open");
```

## What Chrome `[Violation]` lines usually mean

| Console line | Usual owner | Action |
|--------------|-------------|--------|
| `[Violation] 'message' handler took Xms` | React 18 MessageChannel scheduler (`performWorkUntilDeadline`), not `window.onmessage` | Expand the stack before blaming app code. Classifier: `classifyChromeMessageViolation`. |
| Forced reflow | Known sites: `TabCachedPages.nudgePaneScrollLayout` (`void el.offsetHeight`) and `tabCacheReadiness.hasPaintedWorkspaceContent` | Do not “fix” by adding logs. Measure with `__ezzyMainThread` if a new site appears. |

A detached DevTools window left on `/organization-setup` is **not** the
visible Dashboard. The probe records `href` and flags that path.

## Follow-up (not in this change)

Leftover `console.log` outside the hot-path list. They are not the load
regression, but they should not grow:

| Area | Examples |
|------|----------|
| Auth / visibility | `AuthContext.tsx`, `OrganizationContext.tsx`, `jwtRetry.ts` |
| Save / PDF | `useSaveSale.tsx`, `pdfGenerator.tsx`, `invoicePdfUploader.ts` |
| Other | `useStockValidation.tsx`, `useOfflineSync.tsx`, `useFieldSalesAccess.tsx`, `BarcodePrinting.tsx`, `Accounts.tsx` (backfill), `PurchaseEntry.tsx` |

Do **not** add Vite `drop_console`. That would hide `console.error` in
production and make real failures harder to diagnose.

Do **not** add a repo-wide ESLint `no-console`. The existing lint baseline
is already noisy; a blanket rule would either be ignored or force a huge
drive-by. The targeted hot-path guard is the enforceable layer.

## Do not

- Restyle print / thermal / invoice templates to “debug” load
- Touch payment, stock, or RLS while chasing console noise
- Invent a second customer-balance formula
- Change scroll `flex` / `overflow` topology while profiling
