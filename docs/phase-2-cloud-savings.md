# Phase 2 — Cloud usage savings (DONE for core paths)

**Goal:** Fewer duplicate Supabase round-trips on Accounts, POS Quick Payments, and ledger screens.  
**Constraint:** Shared caches + RPC consolidation — **no new scan patterns**, no formula changes.

Status: **Complete** for Accounts header, shared ledger reference, and payment picker (PR #48–49, June 2026).

---

## Enable measurement (Phase 0 companion)

```js
localStorage.setItem('ezzy_cloud_usage', '1');
localStorage.setItem('ezzy_nav_perf', '1'); // optional
location.reload();
```

```js
window.__ezzyCloudUsage.reset();
// … run journey …
window.__ezzyCloudUsage.printReport();
```

See `docs/cloud-usage-baseline.md` for the baseline journey.

---

## Completed

| Area | Before | After | File(s) |
|------|--------|-------|---------|
| Accounts header cards | Paginated full-table scans on load | Single `get_accounts_dashboard_metrics` RPC | `Accounts.tsx`, `PaymentsDashboard.tsx` |
| Ledger / outstanding reference | Per-screen full customer + sales fetches | Shared `useOrgLedgerReferenceData` (10 min stale, tab-return options) | `useOrgLedgerReferenceData.ts` |
| Quick Payments / customer picker | Full ledger scan per open | `fetchCustomersWithBalanceForPaymentPicker` (RPC + shared cache) | `FloatingPayments.tsx`, `customerPaymentPickerList.ts` |
| Customer Ledger | Duplicate reference loads | `useOrgLedgerReferenceFetcher` | `CustomerLedger.tsx` |
| Post-save invalidation | Broad scatter | `invalidateOrgLedgerReferenceData` + `deferredSalesInvalidation` | `deferredSalesInvalidation.ts` |
| POS Dashboard tab return | Refetch all sales every navigation | `useQuery` + 30s `STALE_DASHBOARD_TAB_RETURN` | `POSDashboard.tsx` |
| Purchase / Product tab return | Refetch on every mount | `DASHBOARD_TAB_RETURN_QUERY_OPTIONS` | dashboard pages |

**Net cloud effect:** Fewer repeated full-org reads when switching Accounts ↔ POS ↔ ledger. Diagnostics-only when `ezzy_cloud_usage` is off — **zero production overhead**.

---

## React Query tiers (reference)

| Tier | `staleTime` | Use |
|------|-------------|-----|
| `STALE_DEFAULT` | 30s | App default |
| `STALE_DASHBOARD_TAB_RETURN` | 30s | Window tab return |
| `STALE_REFERENCE` | 2 min | Product catalog, filters |
| `STALE_SETTINGS` | 5 min | Org settings |
| Ledger reference | 10 min | `useOrgLedgerReferenceData` |
| `STALE_LIVE` | 0 | Search / barcode in `queryKey` |

Invalidation on write (sale, receipt, customer) still forces fresh data — caches are not stale forever.

---

## Verify savings

| Route | Before Phase 2 | After (target) |
|-------|----------------|----------------|
| `accounts` | Lifetime `sales` + `voucher_entries` pagination on load | 1× `get_accounts_dashboard_metrics` + shared ledger cache |
| `pos-sales` → Quick Payments | Full customer ledger scan | RPC picker + cache hit on reopen within TTL |
| Tab switch Accounts → POS → Accounts (30s) | Re-scan customers + sales | Cache hit; 0 or 1 light refetch |

Run baseline journey in `cloud-usage-baseline.md` and compare `window.__ezzyCloudUsage.printReport()` request counts.

---

## Not in scope / still latent (do not “fix” without measurement)

From `docs/app-loading-slowness-diagnosis.md` — **unchanged logic**, possible future work:

| Item | Risk if changed blindly |
|------|-------------------------|
| Sales Dashboard dual month scan (`invoice-dashboard-unified`) | Needs RPC design; do not duplicate formulas |
| POS Dashboard bulk `sale_items` Phase 2 batches | Lazy-load on expand only — test qty tiles |
| `sale_items` search without `organization_id` | Needs migration/index review |
| Mobile duplicate `get_erp_dashboard_stats` | Separate mobile path |

---

## Do NOT change

- Balance math: `computeCustomerOutstanding` (`customerBalanceUtils.ts`)
- RLS / `organization_id` filters on tenant tables
- Payment `reference_type` canonical list
- Schema: new timestamped migrations only (Lovable applies)
