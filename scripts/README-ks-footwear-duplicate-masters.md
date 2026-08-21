# KS Footwear — duplicate product masters

## Order of operations

1. Run **Phase 0 (preflight)** in
   `consolidate-ks-footwear-duplicate-masters.sql` against production (SQL editor).
   Review duplicate groups and stock totals.
2. Run **Phase 1 (mutate)** from the same file as one `BEGIN … COMMIT` block.
   It **inlines** the `merge_products` logic (does **not** call the RPC).
   Production `merge_products` requires `assert_org_member` / `auth.uid()`, which
   is missing in the dashboard SQL editor (`42501 Authentication required`).
   Phase 1 also sets `session_replication_role = replica` so purchase stock
   triggers do not fire on `sku_id` remaps (avoids double stock + invalid
   `purchase_sku_change_*` movement types).
   Assertions after mutate:
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
