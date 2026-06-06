# Phase 2 — Performance & Cloud-Usage Audit

Goal: cut Chrome / Windows app dashboard load time, fix "connection problem" errors, and reduce Lovable Cloud (DB) usage. Zero changes to business logic, UI design, bill / barcode printing, or search behavior.

## What the audit found (evidence from live DB)

| Signal | Value | Meaning |
|---|---|---|
| `organization_members` sequential scans | **2,072,078,215** (~2 billion) | RLS / `has_role()` re-evaluated for every row of every query — biggest CPU cost on Cloud |
| `user_roles` sequential scans | 218 million | Same — `has_role()` called per-row, not cached |
| `product_variants` seq scans | 54 million | Same RLS pattern |
| `sales`, `customers`, `credit_notes`, `products` | tens of millions of idx_scan + 100k+ seq_scan | Healthy index use, but RLS adds overhead per call |
| `audit_logs` table | **168 MB / 75k rows** | Bloating writes & backups; nothing prunes it |
| `stock_movements` | 114 MB / 252k rows | Heavy table, fine, but no archival |
| DB size | 601 MB | Headroom OK, but growth is uncontrolled |
| Active connections | 2 | Healthy |

Root cause of the slowness users feel: **RLS policies on hot tables call `has_role()` / `is_member_of_org()` per row, and Postgres re-runs them billions of times**. Even though indexes exist, the function call cost dominates. This is also the #1 driver of Cloud compute usage.

## Phase 2 fixes — split into 4 safe sub-phases

### 2A. RLS function caching (biggest win, zero risk)

Add `STABLE` + `PARALLEL SAFE` markers and wrap calls in `(SELECT …)` so Postgres caches one result per statement instead of per row.

- Re-create `public.has_role(uuid, app_role)` as `STABLE PARALLEL SAFE` (already `SECURITY DEFINER`, keep that).
- Re-create `public.is_member_of_org(uuid)` / `public.current_user_org_id()` likewise.
- Rewrite RLS policies on the **hot** tables to call them as `(SELECT public.has_role(auth.uid(),'admin'))` — Postgres treats this as an InitPlan and runs it once per query, not once per row.
- Hot tables touched: `sales`, `sale_items`, `products`, `product_variants`, `customers`, `purchase_items`, `stock_movements`, `voucher_entries`, `journal_lines`, `customer_ledger_entries`, `audit_logs`, `whatsapp_logs`.

**No policy intent changes. Same rows visible to same users. Just faster.**

Expected impact: 5–20× fewer function calls, large drop in CPU on Cloud, dashboards open noticeably faster.

### 2B. Missing composite indexes on hot read paths

From `pg_stat_user_tables`, these tables already have org-scoped indexes; we'll add the few that are missing where dashboards aggregate:

- `audit_logs (organization_id, created_at DESC)` — used by every dashboard "recent activity"
- `whatsapp_logs (organization_id, created_at DESC)`
- `stock_movements (organization_id, product_id, created_at DESC)` if not present
- `voucher_entries (organization_id, voucher_date DESC)` if not present

Each is `CREATE INDEX IF NOT EXISTS` + `CONCURRENTLY` where possible.

### 2C. Audit-log + stock-movement retention (controls Cloud growth)

- Add a daily pg_cron job that **soft-archives** `audit_logs` older than 180 days into `audit_logs_archive` and deletes from primary. Keeps recent audit history hot (used by History dialog) and stops 168 MB → multi-GB growth.
- Same pattern for `whatsapp_logs` older than 90 days.
- No data is lost — archive table stays.

User confirms retention windows before running (180d / 90d are defaults — easy to change).

### 2D. Frontend connection / loading resilience

- Reduce parallel Supabase channels on dashboard mount (currently several pages open 3–6 realtime channels). Consolidate to one per page via existing `useRealtimeChannel` helper — no UI change.
- Add a single `staleTime: 30_000` default to React Query in `App.tsx` so dashboards don't re-fetch every tab focus during a slow Chrome session.
- Increase `fetch` timeout for the `supabase-js` client wrapper from 15 s to 30 s and add one automatic retry on `Failed to fetch` (the exact symptom users report).
- Already-shipped Phase 1: heavy-tab budget (8 s → 20 s), DB column restored, barcode prefetch.

## What is explicitly NOT changed

- ❌ No change to bill / barcode print templates, thermal layouts, QR positioning
- ❌ No change to search dropdown logic, hybrid product search, or CRM price memory
- ❌ No change to any business calculation (CN, customer balance, GST, COGS, stock formula)
- ❌ No change to UI layout, dashboard density, semantic tokens, or theme
- ❌ No change to RLS *intent* — same rows visible to same users, only faster
- ❌ No package install, no client.ts edit, no types.ts edit

## Roll-out order

1. 2A migration (RLS function caching) — apply, test 1 dashboard, confirm load time drops.
2. 2B migration (indexes) — `CREATE INDEX IF NOT EXISTS`.
3. 2D frontend (staleTime + fetch timeout + channel consolidation).
4. 2C retention — only after you confirm retention windows.

Each sub-phase is independently revertible.

## Verification after each sub-phase

- Open POS Dashboard, Sales Invoice Dashboard, Owner Dashboard, Inventory, Accounts — confirm same data, faster load.
- Spot-check: 1 sale create, 1 purchase create, 1 sale return, 1 barcode print, 1 thermal bill — all unchanged.
- Re-query `pg_stat_user_tables` after 24 h to confirm seq_scan growth rate dropped 10×+.

## Approval needed

Reply **"go 2A"** to start with the safest, highest-impact step (RLS function caching). I'll send each sub-phase as its own migration so you can review before applying.
