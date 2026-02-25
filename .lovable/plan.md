

# Add Delete Button to Purchase Bills (with Permission Check)

## Problem
When selecting purchase bills, only "X bill(s) selected" text is shown with no delete button. Additionally, individual row actions lack a delete button. Admin users with delete rights should see the delete option.

## Solution
Add delete functionality gated by the `delete_records` special permission from the User Rights system, matching the pattern already used in the Sales Invoice Dashboard.

## Changes

### File: `src/pages/PurchaseBillDashboard.tsx`

1. **Import `useUserPermissions` hook** at the top of the file

2. **Initialize the hook** inside the component:
   ```typescript
   const { hasSpecialPermission } = useUserPermissions();
   const canDelete = hasSpecialPermission('delete_records');
   ```

3. **Add Delete button to individual row actions** (around line 990, after the Print Barcodes button):
   - Only show when `canDelete` is true
   - Calls the existing `handleDeleteClick` function
   - Shows loading spinner when that bill is being deleted

4. **Add Delete Selected button to the bulk actions bar** (around line 1206):
   - Only show when `canDelete` is true and bills are selected
   - Calls the existing `handleBulkDeleteClick` function
   - Red destructive variant with Trash2 icon
   - Shows count of selected bills

The existing delete logic (`handleDeleteClick`, `handleBulkDeleteClick`, `handleDeleteConfirm`, `handleBulkDelete`, stock dependency checks, and confirmation dialogs) is already fully implemented in the file -- the buttons to trigger them are simply missing from the UI.

