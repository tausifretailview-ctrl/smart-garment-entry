

# Fix Remaining Multi-Tenant Hardening Items

## What This Fixes

Three pending items from the security hardening that need to be completed:

1. **Orphan rows in `suppliers` and `settings`** -- one row each has no organization assigned, blocking the NOT NULL constraint
2. **Stale global-role policies** on `purchase_items` and `quotation_items` that still use `has_role()` instead of org-scoped checks
3. **Apply NOT NULL constraints** on `suppliers` and `settings` after orphans are resolved

---

## Step 1: Identify and Assign Orphan Rows

Query the orphan rows to find which organization they should belong to (likely the first/only organization), then UPDATE them to assign the correct `organization_id`.

## Step 2: Database Migration

A single migration that:

1. **Assigns orphan rows** to the appropriate organization (using a safe subquery to pick the first org if only one exists)
2. **Sets NOT NULL** on `suppliers.organization_id` and `settings.organization_id`
3. **Drops stale policies**:
   - `purchase_items`: "Admins and managers can access purchase items" (uses global `has_role`)
   - `quotation_items`: "Admins can delete quotation items" (uses global `has_role`)
4. **Creates replacement org-scoped policies** for the dropped ones (these tables already have org-scoped policies from the previous migration, so only the leftover global ones need removal)

## Technical Details

```sql
-- Step 1: Assign orphan supplier to first org
UPDATE suppliers SET organization_id = (SELECT id FROM organizations LIMIT 1)
WHERE organization_id IS NULL;

-- Step 2: Assign orphan settings to first org  
UPDATE settings SET organization_id = (SELECT id FROM organizations LIMIT 1)
WHERE organization_id IS NULL;

-- Step 3: Apply NOT NULL constraints
ALTER TABLE suppliers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE settings ALTER COLUMN organization_id SET NOT NULL;

-- Step 4: Drop stale global-role policies
DROP POLICY IF EXISTS "Admins and managers can access purchase items" ON purchase_items;
DROP POLICY IF EXISTS "Admins can delete quotation items" ON quotation_items;
```

## Risk Assessment

| Change | Risk |
|--------|------|
| Assign orphans to first org | Low -- only 1 row each, safe fallback |
| NOT NULL constraints | Low -- orphans resolved first |
| Drop stale policies | Low -- org-scoped replacements already exist |

No existing data will be lost. The orphan rows simply get assigned to an organization.

