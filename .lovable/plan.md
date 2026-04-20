
User picked Option A: restore the soft-deleted variants of `FLEXI LS/100` and set stock to 1.

## Plan

Run a single scoped UPDATE on `product_variants` for LUCKY SALES → product `29c85e67-3198-40ea-a908-2a0d5b8e408d`:

```sql
UPDATE product_variants
SET deleted_at = NULL,
    stock_qty = 1
WHERE product_id = '29c85e67-3198-40ea-a908-2a0d5b8e408d'
  AND organization_id = '<LUCKY SALES org id>'
  AND stock_qty = 0
  AND deleted_at IS NOT NULL;
```

- Affects exactly the 9 soft-deleted variants
- Silent (no `stock_movements` row)
- Won't touch any variant with stock > 0 or any variant in another org/product
- Result: FLEXI LS/100 becomes active again with 1 unit per variant
