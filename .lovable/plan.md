

## Add Manual Closing Fees Balance Edit for Individual Students

### What's Missing
Currently, the `closing_fees_balance` field on students can only be updated through the bulk Excel/CSV import tool (`FeesBalanceImportDialog`). There is no way to manually edit this value for a single student from the UI.

### What Will Change

**Option 1 (Recommended): Add an editable field in Student Entry page**

A "Closing Fees Balance" input field will be added to the Student Entry form (`src/pages/school/StudentEntry.tsx`), allowing admins to set or update the balance when creating or editing a student.

**Option 2: Add inline edit on Fee Collection page**

An edit icon next to the "Total Due" column on the Fee Collection page that opens a small dialog to update the closing fees balance for that specific student.

### Recommended Approach: Both Options

1. **Student Entry form** -- Add a "Closing Fees Balance" number input field in the fee/financial section of the student form. This allows setting the balance during student creation or when editing student details.

2. **Fee Collection page** -- Add a small edit button next to students who have an imported balance, opening a quick dialog to adjust the balance without leaving the fee collection workflow.

### Technical Details

**Files to modify:**

- `src/pages/school/StudentEntry.tsx` -- Add `closing_fees_balance` field to the form, include it in the save/update query
- `src/pages/school/FeeCollection.tsx` -- Add an edit icon button per row that opens a small dialog to update `closing_fees_balance` directly
- A new small component `BalanceEditDialog.tsx` (optional) -- A minimal dialog with a number input and save button for quick inline edits from the Fee Collection page

**Database:** No schema changes needed -- `closing_fees_balance` column already exists on the `students` table.

