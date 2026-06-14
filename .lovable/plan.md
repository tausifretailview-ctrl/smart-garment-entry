
## Goal
Stay on the Small Cloud instance and eliminate the slow product-with-variants query that averages **2,262–2,623 ms** and dominates total DB time (≈ 52 seconds of CPU per call burst across 21k+ calls).

## Root cause
`pg_stat_statements` shows the offender is the PostgREST query used by Sale Bill / POS / Inventory product search:

```
FROM products
WHERE organization_id = $  AND status = $  AND deleted_at IS NULL
LIMIT $ OFFSET $
+ LATERAL json_agg(product_variants WHERE product_id = products.id AND deleted_at IS NULL)
```

Existing `products` indexes that could match:
- `idx_products_org_created_active (organization_id, created_at DESC, id) WHERE deleted_at IS NULL` — good for ordered scans, but the query has no ORDER BY, so the planner often falls back to a less selective path.
- `idx_products_org_deleted (organization_id, deleted_at)` — not partial, not selective on `status`.

There is **no index that matches `(organization_id, status) WHERE deleted_at IS NULL`**, which is exactly the filter shape the planner needs. The LATERAL variant join is already well-served by `idx_product_variants_product`.

## Fix (single migration, DB-only)

Create one small partial composite index:

```sql
CREATE INDEX IF NOT EXISTS idx_products_org_status_active
  ON public.products (organization_id, status)
  WHERE deleted_at IS NULL;
```

That's it. No table changes, no RLS changes, no RPC changes, no edge function, no front-end code, no print template, no settings.

## Why this is safe
- **Read-only schema addition.** Creating an index does not change any data or any application behavior.
- **Partial index.** Only covers active (non-deleted) rows → small on disk, cheap to maintain.
- **No write-path regression risk** on Small instance: products table write volume is tiny compared to sales/sale_items.
- **No UI / logic / print / QZ Tray / label designer / settings touched.** Zero risk to existing flows, including all your protected printing setup.
- **No new dependencies, no new network calls** → no loading or connection-failure risk.

## Expected impact
- Mean time for the top two slow queries should drop from **2.2–2.6 s** to **< 200 ms** (often < 50 ms) on the Small instance.
- Sale Bill / POS / Inventory product search dropdowns will feel snappy again.
- Removes the main reason `OrgLayout: Sync timeout` would appear under 2–3 concurrent users.

## Verification after apply
1. Re-run `supabase--slow_queries` after a few minutes of normal app use — confirm the two product queries fall off the top of the list (mean_ms < 200).
2. Spot-check Sale Bill and POS product search → dropdown opens instantly.
3. `supabase--db_health` — confirm connections and memory stay in normal range.

## Out of scope (explicitly not touched)
- All print templates (thermal / A4 / A5 / barcode / label designer)
- QZ Tray, printer presets, settings
- RLS policies, RPCs, edge functions
- Front-end code, hooks, routes, queries
- `supabase/config.toml`

## Rollback
One-liner if ever needed:
```sql
DROP INDEX IF EXISTS public.idx_products_org_status_active;
```

Approve and I'll create the migration as the single change in this step.
