
# Fix "JSON object requested, multiple (or no) rows returned" Error

## Root Cause

The organization **Gurukrupa Silk Sarees** has **2 rows** in the `settings` table instead of 1. This causes any query that uses `.single()` to fail because it expects exactly one row but finds two.

- Row 1 (old/empty): `id = 00000000-...`, no business name, created Nov 13
- Row 2 (actual): `id = 6788fceb-...`, business_name = "Gurukrupa Silk Sarees", created Nov 21

When you update the Purchase Code Alphabet and save, the settings save works (it targets a specific ID), but **other parts of the app** that reload settings using `.single()` immediately crash because they find 2 rows.

## Fix (3 parts)

### 1. Delete the duplicate settings row (database migration)
Remove the old empty row, keeping only the one with actual data.

### 2. Add a unique constraint on `organization_id`
Prevent this from happening again by ensuring only one settings row per organization.

### 3. Change `.single()` to `.maybeSingle()` in settings queries
Update the following files to use `.maybeSingle()` instead of `.single()` when querying the settings table, so even if something unexpected happens, the app won't crash:

| File | Line | Change |
|------|------|--------|
| `src/pages/SalesInvoice.tsx` | ~369 | `.single()` to `.maybeSingle()` |
| `src/pages/PurchaseEntry.tsx` | ~269 | `.single()` to `.maybeSingle()` |
| Any other files querying settings with `.single()` | various | Same change |

## Technical Details

**SQL Migration:**
```sql
-- Delete the duplicate (old/empty) settings row
DELETE FROM settings WHERE id = '00000000-0000-0000-0000-000000000001';

-- Prevent future duplicates
ALTER TABLE settings ADD CONSTRAINT settings_organization_id_unique UNIQUE (organization_id);
```

**Code changes:** Replace `.single()` with `.maybeSingle()` in all settings table queries across the codebase, so they gracefully handle 0 or 1 rows instead of crashing.
