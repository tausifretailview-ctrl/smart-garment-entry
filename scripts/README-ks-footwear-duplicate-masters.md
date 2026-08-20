# KS Footwear — duplicate product masters

## Order of operations

1. Run **Phase 0 (preflight)** in
   `consolidate-ks-footwear-duplicate-masters.sql` against production (SQL editor /
   service role). Review duplicate groups and stock totals.
2. Run **Phase 1 (mutate)** from the same file as one `BEGIN … COMMIT` block.
   It calls `public.merge_products(canonical, duplicate)` per pair and asserts:
   - no remaining duplicate active names in the org
   - no active variants on soft-deleted products
   - stock totals by `LOWER(TRIM(product_name))` unchanged
3. Apply migration
   `supabase/migrations/20261120120000_unique_active_product_name_per_org.sql`
   (fails closed if any org still has duplicate active names).

## App fix (no DB required)

Sale Order pick list (`SaleOrderDashboard`) now converts using **family**
on-hand stock (same article / brand / colour across sibling masters), not only
the bound `variant_id` row.
