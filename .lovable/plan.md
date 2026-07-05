# Loading Speed & Cloud Usage — Investigation + Plan

## What I found

Your app already has three completed optimization phases (documented in `docs/`):

- **Phase 1 (shell loading)** — tab cache, shell-first render, org sync fail-open. Done.
- **Phase 2 (cloud savings)** — Accounts RPC, shared ledger cache, Quick Payments picker, tab-return stale times. Done.
- **Phase B audit (2026-06-27)** — identified 10 remaining hotspots (F1–F10). **Not yet applied.**

Global React Query defaults are already conservative (30s stale, no window-focus refetch, retry 1). Realtime channels are org-scoped. Edge functions only fire on user action. Mobile polling is off.

The **preview shows a boot splash spinner** — that's the normal `AppBootSplash` while the org context syncs. Console shows one relevant warning:

```
OrgLayout: Sync timeout reached, forcing render
```

This means the 4s org-sync fail-open is triggering — user still sees the app, but the initial DB round-trip is slow. That's the loading symptom.

## Remaining problems (from the June 27 audit, still open)

| # | Issue | Impact | Risk |
|---|---|---|---|
| F2 | **StatusBar polls stock + receivables every ~10s** on every page (biggest cloud burn) | ~3,251 calls / audit window | LOW |
| F4 | Customer Master `SELECT *` — fetches 22 cols, shows 9 | Bandwidth + plan cost | LOW |
| F8 | Customer Master pagination uses `count:'exact'` | Doubles plan cost | LOW |
| F1 | `sale_items + sales` LATERAL re-join on already-scoped IN list | 234s total | LOW |
| F6 | `product_variants SELECT *` missing `organization_id` (RLS scan) | 61s total | LOW |
| F7 | `customer_product_prices SELECT *` missing `organization_id` | 61s total | LOW |
| F10 | `fixMissingMrp` UPDATE loop — 1 row at a time (1000 calls) | 149s total | LOW |
| F3 | `products + variants + size_groups` full embed (2.6s mean) | Some master screen | MED |
| F9 | Older POS variant-lookup ILIKE path still hot | 85s total | MED |
| F5 | Inventory search — verify 250ms debounce | Minor | LOW |
| — | `DailyCashierReport` + `CustomerReconciliation` use `staleTime: 0` | Minor tab-return waste | LOW |

## Plan — apply in 3 batches, low-risk first

### Batch C1 — biggest win, lowest risk (recommended first)
1. **F2 StatusBar polling** — lift `staleTime` from `STALE_FREQUENT` (10s) to `STALE_REFERENCE` (2 min); invalidate on sale/receipt save so it stays accurate. Single biggest reduction in daily reads.
2. **F4 Customer Master narrow SELECT** — list only the 9 displayed columns (`id, customer_name, phone, email, gst_number, opening_balance, points_balance, discount_percent, created_at`).
3. **F8** — switch Customer Master pagination `count` to `planned`.
4. **F1** — drop the inner LATERAL `sales` re-join in `fetchSaleItemsByOrg` callers that already have org scope; group client-side.

### Batch C2 — correctness + cost
5. **F6 / F7** — add missing `.eq('organization_id', …)` to `product_variants` and `customer_product_prices` fetches; find caller via grep.
6. **F10** — batch `fixMissingMrp` into a single `UPDATE ... WHERE id = ANY($ids) AND mrp IS NULL`.

### Batch C3 — medium risk, isolated
7. **F3** — locate the 2.6s `products+variants+size_groups` embed caller, route through paginated `get_product_catalog_page` RPC.
8. **F9** — audit POS variant-lookup call sites; ensure all use indexed `lookupBarcodeStock`.

### Batch C4 — minor cleanups
9. Confirm 250ms debounce on Inventory / Product Master search boxes.
10. Lift `staleTime: 0` → 30s on `DailyCashierReport` + `CustomerReconciliation`.

## Loading (boot splash) — separate small fix
The `OrgLayout: Sync timeout reached, forcing render` warning fires after 4s. If it recurs, worth logging which query hangs (org fetch vs permissions vs field-sales access) and either raise the timeout for that specific query or move it off the critical path. Track in Batch C1 only if reproducible.

## Guardrails (unchanged)
- No formula changes (balances, GST, stock).
- No RLS or `organization_id` scope changes on tenant tables.
- No new polling patterns.
- One batch at a time; verify via `window.__ezzyCloudUsage.printReport()` before next batch.

## Deliverable per batch
Grep → patch → build → run baseline journey → compare cloud-usage report. Update `docs/cloud-usage-audit-2026-06-27.md` with the "after" numbers.

## Recommendation
**Start with Batch C1** — highest cloud-read savings for smallest surface area. Reply with "start C1" (or pick a specific item) and I'll implement.
