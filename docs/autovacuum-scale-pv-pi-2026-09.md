# Autovacuum scale_factor — product_variants & purchase_items (2026-09)

## Why
Health check 13 Sep 2026: both tables had ~15% dead tuples under the cluster
default `autovacuum_vacuum_scale_factor = 0.2` (same pattern as `sales` before
17 Aug). `sales` was fixed with `SET (autovacuum_vacuum_scale_factor = 0.05)` —
autovacuum fired within minutes; dead tuples 8,423 → 0; no lock issues.

## Apply
Migration: `supabase/migrations/20260914120000_autovacuum_scale_product_variants_purchase_items.sql`

Or SQL Editor (preferred for immediate live apply): `scripts/autovacuum-scale-pv-pi-2026-09.sql`

1. Run **§1 BEFORE** — export CSV (live/dead/%, last_autovacuum, scale_factor).
2. Run **§2 APPLY** — two `ALTER TABLE … SET` only. **No `VACUUM`.**
3. Run **§3** — confirm both show `0.05` (include `sales` as control).
4. Hours later: re-run **§1** as **§4 AFTER** — confirm `last_autovacuum` moved and dead % dropped.

## Do not
- Manual `VACUUM` / `VACUUM FULL` as part of this change
- Change any other autovacuum knobs, queries, or RLS
