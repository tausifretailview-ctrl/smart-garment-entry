# Performance Wave 1 — navigation & perceived speed

**Goal:** Faster menu clicks and clearer loading — **zero extra Supabase reads** (JS prefetch only).

## What shipped (Wave 1)

| Change | User benefit | Cloud cost |
|--------|--------------|------------|
| Named tab shells (“Opening Customers…”) | Know which page is loading | None |
| Dashboard KPI hover/touch prefetch | Main dashboard → list pages feel instant | None |
| Accounts/payments/ledger idle + sibling warm | Payments ↔ Customer Ledger ↔ Accounts | None |
| Read timeout toast (first load only) | Clear message instead of endless spinner | None |

Already in place from earlier phases: sidebar `NavLink` prefetch, tab cache, 3s soft hint, StatusBar `STALE_REFERENCE`.

## Measure before / after

```js
localStorage.setItem('ezzy_nav_perf', '1');
localStorage.setItem('ezzy_cloud_usage', '1');
location.reload();
window.__ezzyCloudUsage.reset();
// Dashboard → Customers → Accounts → Payments → POS
await window.__ezzyNavPerf.copyReport();
window.__ezzyCloudUsage.printReport();
```

Expect lower `chunkLoadMs` on second navigation to the same route; cloud read count unchanged vs baseline.

## Rollout

1. Merge → Vercel deploy (all orgs get new JS).
2. Smoke **demo** org: dashboard KPI click, sidebar Customers, Accounts → Payments.
3. Watch 24h — no new errors; optional re-run cloud usage on busiest org.

## Wave 2 (next — DB/query shape)

- Sales Invoice Dashboard single stats RPC (remove double month scan)
- POS Dashboard lazy sale_items on row expand
- Report date-range guards + `57014` per-screen empty states

See `docs/cloud-usage-audit-2026-06-27.md` and `docs/phase-3-perf-audit-2026-07.md`.

## Infrastructure

Upgrade Lovable/Supabase **Small → Medium** only if, after Wave 2, CPU stays high or 8s timeouts persist on normal daily work — not for chunk-load slowness alone.
