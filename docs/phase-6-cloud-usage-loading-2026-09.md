# Phase 6 — Cloud usage and loading

**Date:** 2026-09-02  
**Scope:** Route-attributed cloud-usage capture + CI proof that no tab-cache / Outlet destination falls back to a silent empty render. **No new RPC. No schema.**

Do **not** paste this Markdown into the SQL editor.

---

## What this phase does

1. **OrgLayout** writes the current window-tab path into `window.__ezzyCloudUsage` on every navigation, so a Phase 6 capture is not limited to Accounts.
2. **Quick Payments** overlays `pos-sales:quick-payments` while the dialog is open and restores the tab path on close (it no longer wipes attribution to `""`).
3. **`copyJson()`** dumps a pasteable `CloudUsageJsonReport` (`phase: "6"`) for `docs/cloud-usage-baseline.md`.
4. **`resolveTabLoadShell`** lives in `src/lib/tabLoadShell.ts`. Every `TAB_PAGE_REGISTRY` path maps to `entry` / `dashboard` / `page`. Cold nav never silences Suspense. POS / bill-entry shells never go silent even with a painted sibling. Insights (not in the registry) is `"page"` + Outlet `LazyFallback`, not a blank frame.

---

## What this environment cannot capture

There is no self-service signup and no tenant credentials here. Authenticated POS → Sales → Accounts → Quick Payments request counts must be captured **on a shop preview after sign-in**:

```js
localStorage.setItem('ezzy_cloud_usage', '1');
location.reload();
window.__ezzyCloudUsage.reset();
// run the journey in docs/cloud-usage-baseline.md
window.__ezzyCloudUsage.copyJson();
```

Paste the JSON into the capture slots in that file. Expected RPCs on StatusBar / Accounts after Phases 2–4:

- `get_dashboard_stock_summary`
- `get_dashboard_purchase_summary`
- `get_accounts_dashboard_metrics`

`v_dashboard_stock_summary` / `v_dashboard_purchase_summary` should **not** appear on those tiles.

---

## Blank-page / slow-network (CI)

| Invariant | Where |
|---|---|
| Every registry path has a named load shell | `src/lib/tabLoadShell.test.ts` |
| Cold nav → shell, never `null` | same |
| Entry / POS never silent | same |
| No destination without a watchdog rescue | `destinationsWithNoWatchdog() === []` |
| 1.2s blank-frame → Outlet | `OrgLayout` `BLANK_FRAME_GRACE_MS` |
| 3s soft hint then route-shaped shell | `TabCachedPages` `SOFT_LOADING_HINT_MS` |
| Load shells count as painted | `data-ezzy-load-shell` on splash + dashboard skeleton |
| Insights stays permission-gated on Outlet | `tabPageRegistry` comment + `App.tsx` |

Authenticated Slow-3G loop (Purchase Bills → Ledger → Insights) still needs a signed-in preview — recorded as outstanding in `docs/blank-page-render-owner-2026-08.md`. Public `/:orgSlug` login still paints `OrgAuth` (not an empty workspace).

---

## Operator: after Phases 2–4 SQL is live

1. Sign in on the busiest org.
2. Enable `ezzy_cloud_usage` (do not leave it on for cashiers).
3. Run the baseline journey once, `copyJson()`, paste under **Phase 6 capture** in `docs/cloud-usage-baseline.md`.
4. Disable the flag.

No SQL in this phase.
