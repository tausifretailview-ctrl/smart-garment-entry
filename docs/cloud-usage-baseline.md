# Cloud usage baseline (Phase 0 / Phase 2)

Read-only measurement — **no production behavior changes** when diagnostics are off.

**Phase 2 status:** Accounts RPC, shared ledger cache, and payment picker optimizations are **implemented**. Use this doc to confirm request counts on your busiest org after deploy.

---

## Enable diagnostics

```js
localStorage.setItem('ezzy_cloud_usage', '1');
localStorage.setItem('ezzy_nav_perf', '1'); // optional: tab-switch timing
location.reload();
```

Or: `?cloudusage=1&navperf=1` on any org URL.

### Disable

```js
localStorage.removeItem('ezzy_cloud_usage');
localStorage.removeItem('ezzy_nav_perf');
location.reload();
```

---

## Baseline journey

Run on your busiest organization (largest customer + sales counts):

1. `window.__ezzyCloudUsage.reset()`
2. Login → **POS** (idle 30s) → **Sales Dashboard** → **Accounts** → **Customer Ledger** → back to **POS**
3. Open **Quick Payments** (POS) → pick a customer → close
4. **Inventory:** Purchase Bills ↔ Products ↔ Purchase Entry (window tabs)
5. Print reports:
   - `window.__ezzyCloudUsage.printReport()`
   - `window.__ezzyNavPerf.printReport()` (if enabled)

Save report text to compare across releases.

---

## Targets (Phase 2 — achieved in code)

| Route | Target |
|-------|--------|
| `accounts` | **No** lifetime `sales` + `voucher_entries` pagination on load |
| `accounts` | **Single** `get_accounts_dashboard_metrics` RPC for header cards |
| `accounts` / ledger | Shared `org-ledger-customers` + `org-ledger-sales-summary` cache (10 min) |
| `pos-sales` Quick Payments | `fetchCustomersWithBalanceForPaymentPicker` — not full ledger scan per open |
| Tab return (30s) | `DASHBOARD_TAB_RETURN` — skip duplicate list fetches |

---

## Phase 1 — no extra cloud cost

Shell-first UI, tab cache, and chunk prefetch **do not add Supabase queries**. They reduce perceived load and avoid remount refetches.

| Mechanism | Cloud effect |
|-----------|--------------|
| `refetchOnMount: false` on tab-return dashboards | **Fewer** reads on window-tab switch |
| `refetchOnWindowFocus: false` (global) | **Fewer** reads on alt-tab |
| Idle prefetch (JS chunks only) | **Zero** Supabase |
| Org cached fallback on timeout | **Same or fewer** failed retries |

---

## Notes

- Counter tracks `fetch` to Supabase REST/RPC URLs only.
- Edge Functions (`/functions/v1/`) not included yet.
- Diagnostics add a thin `fetch` wrapper — disable in production unless troubleshooting.

---

## Related

- [phase-2-cloud-savings.md](./phase-2-cloud-savings.md) — implementation detail
- [phase-0-navigation-perf.md](./phase-0-navigation-perf.md) — full test script
