-- Match sales (17 Aug 2026): lower autovacuum threshold so hot tables
-- vacuum before default scale_factor 0.2 (~20% dead) is reached.
-- product_variants / purchase_items were at ~15% dead with stale last_autovacuum
-- (health check 13 Sep 2026). Storage parameter only — no VACUUM here.

ALTER TABLE public.product_variants
  SET (autovacuum_vacuum_scale_factor = 0.05);

ALTER TABLE public.purchase_items
  SET (autovacuum_vacuum_scale_factor = 0.05);
