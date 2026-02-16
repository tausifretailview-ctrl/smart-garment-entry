

# Bulk Update Students from Excel

## What This Does
Adds a **"Bulk Update"** mode to the Student Excel Import system so you can upload your Excel file (like `STUDENT_DATA_2026-27.xlsx`) and update existing students' **Class, Division, Roll Number, and Phone Numbers** in bulk -- matching students by their name.

## How It Will Work

1. On the Student Master page, a new **"Bulk Update"** button appears next to "Import Excel"
2. Upload the Excel file -- the system reads columns like `CHILD NAME`, `CLASS`, `DIV`, `Roll No`, `FATHER NO`, `MOTHER NO`
3. The system matches each row against existing students by **student name** (case-insensitive, trimmed)
4. A preview screen shows:
   - How many students were **matched** (will be updated)
   - How many were **not found** (skipped)
   - A preview table showing: Name, Current Phone -> New Phone, Current Class -> New Class, etc.
5. On confirmation, it bulk-updates: `class_id`, `division`, `roll_number`, `parent_phone`, `parent_name`, `address`

## Matching Logic
- Normalize student names: trim whitespace, collapse multiple spaces, case-insensitive comparison
- Strip prefixes like "MS.", "MST.", "MR." before matching for better accuracy
- Use `FATHER NO` as `parent_phone` and `FATHER` as `parent_name`

---

## Technical Details

### File: `src/components/school/StudentBulkUpdateDialog.tsx` (New)
- New dialog component with steps: upload -> preview -> updating -> done
- Parses Excel with flexible column mapping for:
  - `CHILD NAME` / `Student Name` / `Name` -> match key
  - `CLASS` / `Class Name` -> resolve to `class_id`
  - `DIV` / `Division` -> `division`
  - `Roll No` / `Roll Number` -> `roll_number`
  - `FATHER NO` / `Parent Phone` / `Father No` -> `parent_phone`
  - `FATHER` / `Parent Name` / `Father Name` -> `parent_name`
  - `ADDRESS` / `Address` -> `address`
- Fetches all existing students for the org, matches by normalized name
- Preview shows matched students with old vs new values highlighted
- Updates in batches of 50 using supabase `.update()` by student `id`

### File: `src/pages/school/StudentMaster.tsx` (Modified)
- Add "Bulk Update" button next to "Import Excel"
- Import and render `StudentBulkUpdateDialog`

### Name Normalization Function
```text
"MS.MAHERA LATIF SHAIKH" -> "mahera latif shaikh"
"MST. NAUFIL VAHID SHIKALGAR" -> "naufil vahid shikalgar"
```
Strips: MS., MST., MR., MRS. prefixes, trims, lowercases, collapses spaces.

### No Database Changes
All fields (`class_id`, `division`, `roll_number`, `parent_phone`, `parent_name`, `address`) already exist in the `students` table.

