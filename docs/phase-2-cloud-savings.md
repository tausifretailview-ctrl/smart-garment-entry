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

---

## Phase 3 — small-instance hot queries (2026-06-19)

Goal: keep Lovable Cloud on the **small** instance after the medium→small downgrade.
Baseline from `pg_stat_statements`:

| Query | Calls | Mean | Total |
|-------|------:|-----:|------:|
| `products + product_variants` LATERAL list | 12.5K | 2.26s | 7.8 hrs |
| Same, with `uom` column | 9.2K | 2.62s | 6.7 hrs |
| Same, nested `batch_stock` LATERAL | 45K | 0.45s | 5.6 hrs |
| `product_variants` barcode ilike | 19.4K | 0.67s | 3.6 hrs |
| `printer_presets` UPDATE storm | **1.68M** | 6ms | 2.9 hrs |
| `voucher_entries` description ilike × 12 | 91K | 67ms | 1.7 hrs |

### Shipped

1. **GIN trigram index on `voucher_entries.description`** (partial, `deleted_at IS NULL`) — replaces seq-scan for the 12-way ilike OR chains used by `fetchSaleReceiptSplitsForInvoices`, `customerAuditBundle`, `CustomerLedger`, and CN dialogs.
2. **Composite `(organization_id, voucher_type, reference_type)`** partial index on `voucher_entries` — lets the planner narrow before the trigram scan.
3. **`printer_presets` mirror-write dedupe** in `useBarcodeLabelSettings.saveLabelTemplate` — module-level signature cache skips identical UPDATEs; complements the existing dedupe guard in `BarcodePrinting.tsx`.

### Not changed (already optimal or out of scope)

- `idx_product_variants_barcode_trgm` already exists — slow ilike samples are historical; new queries should pick it up.
- `products`/`product_variants` indexes already comprehensive (`org_status`, `org_status_name`, `org_product_active`, trigram on name/brand). No new indexes needed; slowness comes from `select=*` payload size. Caller trimming deferred — measure first after the description-trigram win.
- No business-logic, RLS, or formula changes.

### Verify

After 24h of traffic, re-run `supabase--slow_queries` and compare `total_ms` for the two voucher_entries patterns and `printer_presets` UPDATE.
