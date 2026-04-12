

## Plan: Add Permanent Project Instruction for Safe Database Practices

### What
Add a permanent instruction to the project's plan/guidelines file (`.lovable/plan.md`) documenting the following database safety rules:

1. Never write `DELETE` or `UPDATE` queries without a scoped `organization_id` WHERE clause
2. Never drop columns or tables without an `IF EXISTS` guard
3. Always use soft delete (`deleted_at`) instead of hard delete on critical tables

### Changes

**File: `.lovable/plan.md`** — Append a new section:

```markdown
## Database Safety Rules (Permanent)

- **Scoped mutations**: Every `DELETE` or `UPDATE` SQL statement MUST include a `WHERE organization_id = ...` clause. No unscoped mutations allowed.
- **Safe DDL**: Never `DROP COLUMN` or `DROP TABLE` without `IF EXISTS` guard.
- **Soft delete over hard delete**: Critical tables (sales, purchases, customers, suppliers, products, returns, orders, quotations, vouchers, credit_notes, employees) must use `deleted_at` / `deleted_by` columns instead of hard `DELETE`. Hard delete is only permitted from the Recycle Bin after explicit user confirmation.
```

This is a single-file text addition — no code, schema, or logic changes.

## Database Safety Rules (Permanent)

- **Scoped mutations**: Every `DELETE` or `UPDATE` SQL statement MUST include a `WHERE organization_id = ...` clause. No unscoped mutations allowed.
- **Safe DDL**: Never `DROP COLUMN` or `DROP TABLE` without `IF EXISTS` guard.
- **Soft delete over hard delete**: Critical tables (sales, purchases, customers, suppliers, products, returns, orders, quotations, vouchers, credit_notes, employees) must use `deleted_at` / `deleted_by` columns instead of hard `DELETE`. Hard delete is only permitted from the Recycle Bin after explicit user confirmation.


