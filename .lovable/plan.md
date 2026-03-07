

## New Academic Year (2026-27) - Student Promotion & Fee Entry Workflow

### Current State

Right now, the system has **no year transition or promotion feature**. Each student record has a single `academic_year_id`. To start 2026-27, you would need to:

1. **Create the new Academic Year** (2026-27) in Academic Year Setup and mark it as current
2. **Manually update each student's** academic year and class (promotion) -- no bulk tool exists for this
3. **Set up Fee Structures** for 2026-27 by selecting the new year in Fee Structure Setup
4. **Collect Fees** using the year filter on Fee Collection page

### What's Missing

There is **no "Promote Students" or "Year Transition"** feature. This is a critical gap. Here is a plan to build it:

### Plan: Add Student Promotion / Year Transition Feature

**1. Add "Promote Students" page/dialog** (`src/pages/school/StudentPromotion.tsx`)
- Year selector: "From Year" (e.g., 2025-26) → "To Year" (e.g., 2026-27)
- Class mapping table: Current Class → Promoted Class (e.g., STD I → STD II, STD X → Passed Out)
- Checkbox list of students per class with Select All
- "Promote Selected" button that bulk-updates `academic_year_id` and `class_id` for selected students
- Option to mark students as "status: passed_out" for final class
- Reset `closing_fees_balance` to 0 or carry forward pending dues

**2. Add navigation entry** in the School sidebar for "Promote Students"

**3. Update Academic Year Setup** - add a "Set as Current" action that updates all relevant defaults across the app

**4. Fee Structure for new year** - already works (select 2026-27 year + class in Fee Structure Setup and define amounts)

**5. New admissions for 2026-27** - already works (Student Entry form has Academic Year dropdown; just select 2026-27)

### Technical Details

- **Promotion logic**: Single UPDATE query per batch (50 students) setting new `academic_year_id` and `class_id`
- **Class mapping**: Auto-suggest next class based on `display_order` from `school_classes`
- **Carry-forward balance**: Calculate unpaid amount from current year fee structures minus payments, store as `closing_fees_balance` on the student record for the new year
- **No schema changes needed** -- all fields (`academic_year_id`, `class_id`, `closing_fees_balance`, `status`) already exist on the `students` table

### Summary of Steps
1. Create `StudentPromotion.tsx` page with year-to-year promotion UI
2. Add promotion route and sidebar link
3. Implement bulk promotion mutation (update class + academic year)
4. Add carry-forward balance calculation option
5. Test end-to-end: create 2026-27 year → promote students → set fee structures → collect fees

