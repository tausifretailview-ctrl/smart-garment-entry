# Cloud usage baseline (Phase 0)

Read-only measurement guide — no production behavior changes when diagnostics are off.

## Enable diagnostics

Browser / Windows app console:

```js
localStorage.setItem('ezzy_cloud_usage', '1');
localStorage.setItem('ezzy_nav_perf', '1'); // optional: tab-switch timing
location.reload();
```

Or open any org URL with `?cloudusage=1&navperf=1`.

## Baseline journey

Run on your busiest organization (largest customer + sales counts):

1. Reset counters: `window.__ezzyCloudUsage.reset()`
2. Login → **POS** (idle 30s) → **Sales Dashboard** (monthly, unchanged) → **Accounts** → **Customer Ledger** → back to **POS**
3. Open **Quick Payments** floating dialog (POS) → pick a customer → close
4. Print reports:
   - `window.__ezzyCloudUsage.printReport()`
   - `window.__ezzyNavPerf.printReport()` (if nav perf enabled)

Save the report text before/after Phase 1 changes to compare request counts per route.

## What to record

| Route | Target after Phase 1 |
|-------|----------------------|
| `accounts` | No lifetime `sales` + `voucher_entries` pagination on load |
| `accounts` | Single `get_accounts_dashboard_metrics` RPC for header cards |
| `pos-sales` | Quick Payments uses shared RPC picker cache (not full ledger scan) |

## Notes

- Diagnostics only count `fetch` calls to Supabase REST/RPC URLs.
- Edge Functions (`/functions/v1/`) are not included in this counter yet.
- Disable in production troubleshooting: `localStorage.removeItem('ezzy_cloud_usage')`.
