
This is a detailed, well-specified DB-only migration. No code changes, no UI. Just need to confirm a couple of schema assumptions before writing the migration.

Key things to verify:
1. `organizations` table has `org_name` and `deleted_at` columns
2. `organization_users` table exists with `user_id` and `organization_id`
3. `detect_stock_discrepancies` returns the expected columns
4. `product_variants` has `stock_qty` column

Let me check these quickly.
