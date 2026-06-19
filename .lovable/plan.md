# Phase 3 — Stay on Small Instance, Run Faster

Goal: reduce Cloud CPU + bandwidth so the small instance comfortably handles current 38 orgs and grows toward 100, without touching billing math, RLS, or print/PDF behavior.

Evidence (live DB): memory 64%, WAL 496 MB, rolled-back txns 3.5M since boot — symptoms of repeated heavy reads + retried writes, not size.

---

## 1. Top slow queries to fix (from pg_stat_statements)


| #   | Query pattern                                                                                                | Calls     | Total time | Root cause                                                               | Fix                                                                                                                                                                                                                                |
| --- | ------------------------------------------------------------------------------------------------------------ | --------- | ---------- | ------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | `products + product_variants` full org scan (`status=active, deleted_at IS NULL`) — 4 variants of same shape | ~75K      | ~72 min    | Whole catalog pulled into client repeatedly                              | Route every catalog read through the existing `get_active_catalog_*` RPC + `STALE_REFERENCE` (2 min). Forbid `.from("products").select("*, product_variants(*)")` outside the RPC.                                                 |
| 2   | `product_variants ilike barcode` (POS scan)                                                                  | 19K + 10K | ~24 min    | `ilike` can't use btree, scans all variants                              | Add `CREATE INDEX ... ON product_variants (lower(barcode)) WHERE deleted_at IS NULL AND active = true`. Switch POS scan to exact `.eq('barcode', code)` first, fall back to `ilike` only if no hit.                                |
| 3   | `voucher_entries description ilike (12 OR clauses)`                                                          | 91K       | 100 min    | Description full-text scan on every Accounts open                        | Add `pg_trgm` GIN index on `voucher_entries.description` + scope by `organization_id` (already present) and `reference_type`. Better: replace description match with `reference_id` lookup where caller already knows the sale id. |
| 4   | `printer_presets UPDATE` 1.68M calls                                                                         | —         | 175 min    | Historical (already fixed by dedupe guard in `BarcodePrinting.tsx:1390`) | Verify guard with diagnostics; no further change.                                                                                                                                                                                  |
| 5   | `purchase_items WHERE sku_id = ANY(...)` ORDER BY created_at                                                 | 75K       | 119 min    | Missing composite index                                                  | `CREATE INDEX ON purchase_items (sku_id, created_at DESC) WHERE deleted_at IS NULL`.                                                                                                                                               |
| 6   | `product_variants ORDER BY stock_qty DESC` no org filter                                                     | 36K       | 101 min    | Cross-tenant scan from a stock report                                    | Add `organization_id` filter + composite index `(organization_id, stock_qty DESC) WHERE deleted_at IS NULL`.                                                                                                                       |


All Phase 3 indexes are `CREATE INDEX` (plain — works in our migration tool). One migration file.

---

## 2. Stop unnecessary polling & re-fetch storms


| Where                                           | Current                                       | Change                                                                                                                        |
| ----------------------------------------------- | --------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------- |
| `useTierBasedRefresh`                           | All tiers poll every 10–60 min even when idle | Add `document.hasFocus()` guard and skip polling on routes that already invalidate on save (POS, Sales, Purchase dashboards). |
| `useVisibilityInvalidate` consumers             | Invalidate full lists on every tab return     | Limit to the active route's primary key only; drop wholesale `["sales"], ["customers"], ["products"]` blanket invalidations.  |
| `refetchOnReconnect` global                     | true (RQ default)                             | Set to `false` in `App.tsx` QueryClient — Cloud network blips currently trigger N parallel refetches.                         |
| Mobile path duplicate `get_erp_dashboard_stats` | Fires twice on mobile mount                   | De-dupe via shared hook.                                                                                                      |


---

## 3. Diagnostics & log waste


| Item                                                               | Current                                    | Change                                                                                           |
| ------------------------------------------------------------------ | ------------------------------------------ | ------------------------------------------------------------------------------------------------ |
| `cloudUsageDiagnostics` patches `window.fetch`                     | Loaded for everyone, no-op unless flag set | Tree-shake out of prod build via `import.meta.env.DEV` guard.                                    |
| `navigationPerfDiagnostics`                                        | Same pattern                               | Same guard.                                                                                      |
| `console.log` in hot paths (POS save, barcode scan, draft persist) | ~200 sites                                 | Wrap with `if (import.meta.env.DEV)` for the loudest 20 files (POS, sale save, draft, WhatsApp). |
| `app_error_logs` writes                                            | Every caught error inserts a row           | Add client-side rate-limit (1 insert per error signature per minute per session).                |
| `whatsapp_logs`, `audit_logs`, `stock_movements`                   | Grow unbounded → 500MB WAL                 | Schedule `pg_cron` nightly to move rows > 6 months into existing `*_archive` tables.             |


---

## 4. Code-side dead weight to remove

Files / paths that ship in the bundle but are not reached at runtime by paying tenants:

- Dev-only `AdminHealth.tsx` route — gate behind `platform_admin` lazy import (already lazy, just confirm no eager import).
- `useCloudUsageEstimate` hook polling `auth.users` — only mount on Settings page.
- `lovable-tagger` dev plugin — verify it's only in `vite.config.ts` `if (mode === 'development')`.
- Duplicate Supabase round-trips on Customer Ledger open (load reference twice — known, fix by reading from `useOrgLedgerReferenceFetcher` cache).

---

## 5. Verify before/after

1. Enable diagnostics: `localStorage.setItem('ezzy_cloud_usage','1')`, reload.
2. Run baseline journey from `docs/cloud-usage-baseline.md`.
3. Capture `window.__ezzyCloudUsage.printReport()`.
4. Apply Phase 3 migration + code changes.
5. Re-run journey, expect:
  - POS open → < 10 Supabase requests (today: 25–40).
  - Accounts open → 1 RPC + 0 voucher description scans.
  - Tab switch within 30s → 0 refetches (cache hit).
6. Re-check `pg_stat_statements` after 24h on production — top 5 queries should drop > 70% in total_ms.

---

## Technical files touched

- New migration: indexes + `pg_trgm` GIN + archival `pg_cron` jobs.
- `src/App.tsx` — `refetchOnReconnect: false`.
- `src/hooks/useTierBasedRefresh.tsx` — focus + route guard.
- `src/hooks/useVisibilityRefetch.tsx` — scoped keys only.
- `src/lib/cloudUsageDiagnostics.ts`, `src/lib/navigationPerfDiagnostics.ts` — `import.meta.env.DEV` gating.
- POS barcode scan hook — exact match first.
- Catalog reads — confirm RPC use everywhere; remove the 4 remaining direct `products(*, product_variants(*))` calls (will list during build).
- Accounts voucher search — call by `reference_id` where possible; trgm GIN otherwise.

## Not in scope (do NOT touch)

- Customer balance math, RLS policies, soft-delete suffix logic.
- Print / PDF / WhatsApp output format.
- Schema of `sales`, `sale_items`, `voucher_entries`.
- Removing real-time `user_permissions` listener (security).
- After this update check Loading issue not come any error like connection failure, 
- Search taking time in product search or customer search check 
- In UI behaviour change like scrolling not working, button not press 
- Our windows application & web application work fine without any error 

## Honest expectation

This buys roughly **2× headroom on the small instance** — memory should fall from 64% → ~45%, top query total time should drop ~70%. Combined with Phase 1+2 already shipped, you should be safe on small up to ~80–100 orgs. After that, the upgrade-to-medium recommendation from the last conversation still applies.