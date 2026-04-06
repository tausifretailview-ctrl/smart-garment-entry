

# Plan: Delete All Products from Mulund Mobility Organization

## Investigation Results

- **Organization**: MULUND MOBILITY (`697c451a-f863-4fe4-82f3-31859a9e5251`)
- **Total Products**: 2,061 (with 1,167 variants)
- **Batch Stock Records**: 1,110 entries linked to variants
- **Transaction Dependencies**: Only **1 product** ("MOTOROLA G57 POWER") is used in a sale. All other 2,060 products have zero transactions.

## Approach

Since the user wants to start fresh, we will create a migration that safely deletes all products and related data **only for this organization**. The one product used in a sale ("MOTOROLA G57 POWER") presents a decision point.

## Steps

### Step 1: Create a database migration

A single migration that executes in the correct order to respect foreign key constraints:

1. **Delete `batch_stock`** — references `variant_id` and `organization_id`
2. **Delete `sale_items`** — references `product_id` / `variant_id` (only 1 record)
3. **Delete `sales`** — the parent sale record (only 1 record, already soft-deleted or not)
4. **Delete `product_variants`** — references `product_id`
5. **Delete `products`** — the main product records

All queries will be scoped strictly to `organization_id = '697c451a-...'`.

### Step 2: Handle the one sale record

The "MOTOROLA G57 POWER" product has 1 sale transaction. To cleanly delete the product, we also need to remove that sale and its items. This is acceptable since the user wants to start fresh.

## Technical Details

```sql
-- Scoped ONLY to Mulund Mobility organization
DELETE FROM batch_stock WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251';

DELETE FROM sale_items WHERE sale_id IN (
  SELECT id FROM sales WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251'
);
DELETE FROM sales WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251';

DELETE FROM product_variants WHERE product_id IN (
  SELECT id FROM products WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251'
);
DELETE FROM products WHERE organization_id = '697c451a-f863-4fe4-82f3-31859a9e5251';
```

## Safety

- Every DELETE is scoped to the specific organization ID — no other org is affected
- No code changes needed — only a one-time data cleanup migration
- After this, the user can start fresh with new purchase entries and products

