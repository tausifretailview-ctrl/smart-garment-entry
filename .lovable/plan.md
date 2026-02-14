

## Plan: Permanently Delete Recycle Bin Data for SM HAIR REPLACEMENT

### Summary
Permanently remove all soft-deleted (recycle bin) records from the **SM HAIR REPLACEMENT** organization. This only affects records where `deleted_at IS NOT NULL` -- active data will not be touched.

### Records to Delete

| Table | Count |
|---|---|
| Sale Items (child) | 134 |
| Sales | 90 |
| Product Variants (child) | 257 |
| Products | 188 |
| Customers | 138 |
| Employees | 1 |
| **Total** | **808** |

### Deletion Order (respecting foreign keys)

1. **sale_items** -- delete soft-deleted items linked to soft-deleted sales in this org
2. **sales** -- delete the 90 soft-deleted sales
3. **product_variants** -- delete soft-deleted variants in this org
4. **products** -- delete the 188 soft-deleted products
5. **customers** -- delete the 138 soft-deleted customers
6. **employees** -- delete the 1 soft-deleted employee

### Technical Details

- Organization ID: `ceb7f3dd-3619-4718-a8c1-43a02252e5b9`
- All deletions will use `WHERE organization_id = '...' AND deleted_at IS NOT NULL` (or join to parent for child tables)
- This is a **permanent hard delete** -- data cannot be recovered
- No active (non-deleted) data will be affected
- Stock is not impacted since stock was already adjusted when these records were soft-deleted

### Implementation
A database migration will execute the DELETE statements in the correct order. No code changes are needed.

