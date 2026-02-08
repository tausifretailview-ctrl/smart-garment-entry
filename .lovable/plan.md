
# Fix School Features Not Showing for School Organizations

## Problem

The "STEAPHIIN INTERNATIONAL HIGH SCHOOL" organization was correctly created with `organization_type = 'school'` in the database, but the School menu (Students, Teachers, Classes, Fee Collection, etc.) is not appearing in the sidebar.

**Root Cause:** The `OrganizationContext.tsx` fetches organization data but is missing the `organization_type` field in its Supabase query. Without this field, the sidebar check `isSchool = currentOrganization?.organization_type === "school"` always evaluates to `false`.

## Database Verification

| Field | Value |
|-------|-------|
| Organization Name | STEAPHIIN INTERNATIONAL HIGH SCHOOL |
| Slug | steaphiin-international-high-school |
| Organization Type | **school** ✓ (correctly set) |
| User Role | admin |

The data is correct in the database - the issue is purely a missing field in the fetch query.

## Technical Fix

### File: `src/contexts/OrganizationContext.tsx`

**Current Query (lines 77-83):**
```typescript
organizations (
  id,
  name,
  slug,
  subscription_tier,
  enabled_features,
  settings
)
```

**Updated Query:**
```typescript
organizations (
  id,
  name,
  slug,
  subscription_tier,
  enabled_features,
  settings,
  organization_type
)
```

This single-line addition will:
1. Fetch the `organization_type` field from the database
2. Populate it in the `currentOrganization` object
3. Enable the sidebar's `isSchool` check to work correctly
4. Show the School menu for school-type organizations

## Expected Result After Fix

The sidebar will show a new "School" collapsible menu with:
- Students
- Teachers  
- Classes
- Academic Years
- Fee Heads
- Fee Collection

All existing business ERP features (Master, Inventory, Sales, Reports, Accounts) will continue to work alongside the school features.
