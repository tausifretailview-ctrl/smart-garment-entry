# Phase 0 — Navigation & cloud measurement

**Purpose:** Measure tab-switch loading and Supabase request counts **before and after** Phase 1/2 fixes.  
Diagnostics are **off by default** — no cloud or CPU impact in production unless explicitly enabled.

**Status (June 2026):** Phase 1 (shell + tab cache) and Phase 2 (shared ledger / RPC savings) are **deployed in code**. Use this runbook to **verify** on your org after each release.

| Phase | Doc | Status |
|-------|-----|--------|
| **0** | This file — measurement | Ongoing verification |
| **1** | [phase-1-shell-loading.md](./phase-1-shell-loading.md) | **Done** (core + inventory) |
| **2** | [phase-2-cloud-savings.md](./phase-2-cloud-savings.md) | **Done** (accounts / picker / tab-return) |

---

## Enable diagnostics

**Navigation timing** — Option A (URL, session):

```
https://your-org.ezzyerp.app/your-org-slug/pos-sales?navperf=1
```

Option B (persists across reloads):

```js
localStorage.setItem('ezzy_nav_perf', '1');
location.reload();
```

**Cloud request counting** (optional, pairs with nav perf):

```js
localStorage.setItem('ezzy_cloud_usage', '1');
location.reload();
```

A **NavPerf** pill appears bottom-right. Press **Ctrl+Shift+P** for the panel.

### Disable when done

```js
localStorage.removeItem('ezzy_nav_perf');
localStorage.removeItem('ezzy_cloud_usage');
location.reload();
```

---

## Test script — core (repeat each scenario twice)

Record: first visit vs return within 30s.

| # | Action | What to watch |
|---|--------|----------------|
| 1 | Login → **POS Sales** | `chunk`, `pos-products`; no burst until needed |
| 2 | Sidebar → **POS Dashboard** | `render=tab-cache`, `pos-sales-list` ≤30s cache |
| 3 | Window tab → **POS Sales** | `instant` or low ms; `remount=no` |
| 4 | **Purchase Bills** | `purchase-bills-list`, `purchase-summary`; shell not full-page spinner |
| 5 | **Products** | `product-catalog`; table skeleton, layout visible |
| 6 | Purchase Bills ↔ Products (30s) | `remount=no`, `data-fetch` skipped |
| 7 | **Purchase Bills** → **Purchase Entry** | **No blank blue screen**; `render=tab-cache` |
| 8 | Alt-tab away and back | No `todays-sales` / ledger refetch storm |

## Test script — inventory (Phase 1 verify)

| # | Action | Pass |
|---|--------|------|
| 9 | **Purchase Returns** | Header + filters visible; table skeleton → rows |
| 10 | **Stock Adjustment** | Same shell-first pattern |
| 11 | Purchase Entry + Excel import → switch tab → return | Lines preserved (PR #50) |
| 12 | Reload with 4+ window tabs | Only active tab mounts first |

## Test script — cloud (Phase 2 verify)

See `docs/cloud-usage-baseline.md`. Quick check:

```js
window.__ezzyCloudUsage.reset();
// Login → POS → Accounts → Quick Payments → back
window.__ezzyCloudUsage.printReport();
```

---

## Reading the NavPerf panel

| Field | Meaning |
|-------|---------|
| **Render: tab-cache** | Good — pane stays mounted on switch |
| **Render: outlet** | Route remounts — slower; should be rare for open window tabs |
| **classification: instant** | Switch &lt; 100ms |
| **classification: chunk** | JS bundle (first visit) |
| **classification: data-fetch** | Supabase round-trip |
| **remount: yes** | Component unmounted — bad for working forms |
| **spinner: yes** | Full-page blocker — should be **no** on inventory dashboards |

### Console API

```js
window.__ezzyNavPerf.printReport()
await window.__ezzyNavPerf.copyReport()
window.__ezzyNavPerf.getTransitions()
window.__ezzyNavPerf.getSnapshot()
```

---

## Environment notes

| Environment | Expected |
|-------------|----------|
| **Web/PWA** | Slim post-login prefetch; inventory chunks on **idle** (~12s) — minimal bandwidth |
| **Electron** | Fuller prefetch; local chunks; multi-tab mounted by default |
| **Electron low-RAM** | `localStorage.ezzy_electron_single_tab = "1"` → remount on return (opt-in) |
| **Slow 2g** | Idle background prefetch skipped (`tabPageRegistry.ts`) — visible tab gets bandwidth |

---

## Decision matrix (post Phase 1/2)

| If you see… | Action |
|-------------|--------|
| Blank blue screen Purchase Bills → Entry | Fixed in `OrgLayout` — verify PR #51/52 deployed |
| `full-page-spinner` on Purchase Returns / Stock Adj | Fixed — redeploy if still seen |
| `render=outlet` on dashboard with window tabs open | Check tab bar has route; `isTabCachePath` |
| `chunk` on first inventory open (web) | Normal once; idle prefetch lowers repeat |
| High `purchase-summary` every switch | Should be cached 30s — check filter change in `queryKey` |
| Accounts load still heavy | Compare `__ezzyCloudUsage` — should be 1 RPC + cache |
| Connection hang on login | `OrganizationContext` 20s timeout + cached orgs |

---

## Share results

```js
await window.__ezzyNavPerf.copyReport()
```

Include: web vs Electron, org size, which step felt slow.

---

## Related docs

- [phase-1-shell-loading.md](./phase-1-shell-loading.md) — what was built
- [phase-2-cloud-savings.md](./phase-2-cloud-savings.md) — RPC + shared cache
- [cloud-usage-baseline.md](./cloud-usage-baseline.md) — cloud counter journey
- [app-loading-slowness-diagnosis.md](./app-loading-slowness-diagnosis.md) — original audit + residual items
- `CURSOR_PROMPT_PERF.md` — Cursor handoff for P3/P4 only
