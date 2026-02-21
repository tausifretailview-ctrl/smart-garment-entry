

## Plan: Import Closing Fees Balance from Excel

### What This Does
Adds a new feature to import closing fees balances for students from your uploaded Excel file. Students are matched by **name + class** (standard) to ensure accurate updates. The Excel file has students grouped under class headers (NURSERY, JUNIOR, SENIOR KG, 1ST STD, etc.) with their outstanding fee amounts.

### Steps

**1. Add `closing_fees_balance` column to students table**
- Add a new nullable numeric column `closing_fees_balance` (default 0) to the `students` table via a database migration.

**2. Create a new "Fees Balance Import" dialog component**
- New file: `src/components/school/FeesBalanceImportDialog.tsx`
- Parses the Excel file which has class headers as section separators (e.g., "NURSERY", "JUNIOR", "1ST STD") followed by student rows with name and balance amount.
- Maps Excel class names to database class names:
  - JUNIOR -> Jr.Kg
  - SENIOR KG -> Sr.Kg
  - 1ST STD -> STD I
  - 2ND STD -> STD II
  - 3RD STD -> STD III
  - 4TH STD -> STD IV, and so on
- Matches students by **normalized name** (case-insensitive, prefix-stripped) AND **class_id** for accurate matching.
- Shows a preview step with matched/unmatched counts before updating.
- Updates the `closing_fees_balance` field in batches of 50.

**3. Add button to Student Master page**
- Add an "Import Fees Balance" button (with an icon) next to the existing "Bulk Update" button in `src/pages/school/StudentMaster.tsx`.

### Technical Details

- **Excel Parsing Logic**: The file has no traditional column headers. Each class section starts with a row containing only a class name (e.g., "NURSERY", "1ST STD"). Subsequent rows have [student_name, balance_amount] until the next class header or empty row.
- **Class Name Mapping**: A mapping dictionary converts Excel class names to the database `school_classes.class_name` values. The class_id is resolved from this mapping.
- **Name Matching**: Uses the existing `normalizeName` pattern (strip MS./MST./MR. prefixes, collapse spaces, lowercase) combined with the resolved class_id for a two-key match.
- **Zero Balances**: Students with balance = 0 or empty are still updated (sets closing_fees_balance to 0).
- **Preview Table**: Shows student name, class, and the balance to be imported, plus unmatched rows.

### Files to Create/Modify
- **Migration**: Add `closing_fees_balance` column to `students` table
- **New**: `src/components/school/FeesBalanceImportDialog.tsx`
- **Edit**: `src/pages/school/StudentMaster.tsx` (add import button + dialog)

