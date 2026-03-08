

## Migration: Add Missing Foreign Key Indexes

Run the user's provided SQL as a single database migration to add indexes on foreign key columns used in JOINs, plus a trigram index on suppliers.

### Action
- Create one migration with the exact SQL provided — no modifications needed.
- Tables affected: `sale_items`, `purchase_return_items`, `sale_return_items`, `voucher_items`, `delivery_challan_items`, `account_ledgers`, `suppliers`

