

## Plan: Fix Product Variants RLS Policies

**What**: Run a database migration to remove overly permissive RLS policies from the `product_variants` table — specifically dropping `"Allow all operations on product_variants for authenticated users"` and `"Allow read"` policies that use `USING(true)`.

**Migration SQL**:
```sql
DROP POLICY IF EXISTS "Allow all operations on product_variants for authenticated users"
  ON public.product_variants;

DROP POLICY IF EXISTS "Allow read" ON public.product_variants;
```

**Steps**:
1. Execute the migration via the database migration tool
2. Verify no code changes are needed — existing queries already scope by `organization_id`, so the remaining org-scoped RLS policies will continue to work

This is a security hardening change with no UI or logic impact.

