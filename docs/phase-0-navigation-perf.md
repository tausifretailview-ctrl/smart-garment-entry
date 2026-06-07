# Phase 0 — Navigation / tab-switch performance measurement

Use this runbook to **measure** loading when switching between dashboards (Purchase → Products, POS → POS Dashboard, etc.) before applying Phase 1 fixes.

## Enable diagnostics

**Option A — URL (session):**

```
https://your-org.ezzyerp.app/your-org-slug/pos-sales?navperf=1
```

**Option B — Console (persists across reloads):**

```js
localStorage.setItem('ezzy_nav_perf', '1');
location.reload();
```

A small **NavPerf** pill appears bottom-right. Press **Ctrl+Shift+P** to open the panel.

## Disable when done

Click **Disable diagnostics & reload** in the panel, or:

```js
localStorage.removeItem('ezzy_nav_perf');
location.reload();
```

## Test script (repeat each scenario twice)

Record results in a table: first visit vs return within 30s.

| # | Action | What to watch |
|---|--------|----------------|
| 1 | Login → open **POS Sales** | Chunk + `pos-products` + `customer-balances` fetch times |
| 2 | Sidebar → **POS Dashboard** | `chunk-load-end`, `pos-sales-list`, `render=tab-cache` |
| 3 | Window tab → back to **POS Sales** | Should be `instant` or low ms; `remount=no` |
| 4 | Sidebar → **Purchase Bills** | `purchase-bills-list` + `purchase-summary` |
| 5 | Sidebar → **Products** | `full-page-spinner` in loading-ui? `product-catalog` duration |
| 6 | Return to **Purchase Bills** within 30s | `remount=no`, data fetch should be 0ms or skipped |
| 7 | Alt-tab away from browser and back | Check if `customer-balances` or `todays-sales` refires |

## Reading the panel

| Field | Meaning |
|-------|---------|
| **Render: tab-cache** | Good — page stays mounted when switching tabs |
| **Render: outlet** | Route remounts each navigation — slower |
| **classification: instant** | Switch &lt; 100ms, no chunk/data/remount |
| **classification: chunk** | JS bundle download (first visit) |
| **classification: data-fetch** | Supabase / RPC round-trips |
| **classification: mixed** | Combination (common on first dashboard open) |
| **remount: yes** | Component unmounted and mounted again |
| **spinner: yes** | Full-page or blocking loader was shown |

## Console API

```js
window.__ezzyNavPerf.printReport()   // log full report
window.__ezzyNavPerf.copyReport()    // copy to clipboard
window.__ezzyNavPerf.getTransitions() // last transitions with timings
window.__ezzyNavPerf.getSnapshot()   // current tab-cache state
```

## Chrome DevTools (parallel check)

1. **Network** tab → filter `Fetch/XHR` — count Supabase calls per switch.
2. **Performance** tab → record one Purchase → Products switch — look for long tasks.
3. Check **render path** in NavPerf panel matches expectations.

## Environment notes

| Environment | Expected difference |
|-------------|---------------------|
| **Web/PWA** | Slim post-login prefetch — first open of Products/Purchase may show `chunk` |
| **Electron desktop** | Fuller prefetch; chunks are local files |
| **Electron single-tab** (`localStorage.ezzy_electron_single_tab = "1"`) | Inactive tabs unmount → `remount=yes` on return |

## Decision matrix (after measurement)

| If you see… | Phase 1 priority |
|-------------|------------------|
| `render=outlet` on dashboard switches | Fix tab-cache activation / open tabs |
| `chunk` on Products/Purchase first open (web) | Add idle prefetch for inventory chunks |
| `full-page-spinner` on Products | Replace with table skeleton (1.1) |
| `purchase-summary` high ms every switch | Raise staleTime + summary RPC (1.3, 2.3) |
| `customer-balances` high ms on POS open | Defer until dropdown opens (1.4) |
| `pos-sales-list` on every POS Dashboard return | TTL bug or `salesRefreshStale` event — check `forced` in meta |

## Share results

Copy the report and paste into your issue/PR:

```js
await window.__ezzyNavPerf.copyReport()
```

Include: environment (web/Electron), org size (approx product/sale count), and which transitions felt slow to the user.
