
# School ERP: Fee Structure Assignment and Fee Collection

## Current State
- Students, Classes, Academic Years, and Fee Heads are all working
- Database tables already exist: `fee_structures`, `fee_schedules`, `student_fees`
- **Missing**: No UI to assign total fees to students (Fee Structure page)
- **Missing**: Fee Collection page is a placeholder -- "Collect" button shows "Coming soon!"

## What We Will Build

### 1. New Page: Fee Structure Setup (`/fee-structures`)
A page where you define how much each class pays for each fee head per academic year.

- Select Academic Year and Class
- Shows a table of all active Fee Heads with amount input fields
- Set frequency (Monthly, Quarterly, Yearly, One-time), due day, and optional late fee
- Save creates/updates records in the `fee_structures` table
- Add sidebar link for "Fee Structures" between "Fee Heads" and "Fee Collection"

### 2. Upgrade Fee Collection Page
Transform the placeholder into a fully working fee collection system:

**When you click "Collect" on a student:**
- Opens a dialog showing all fee heads applicable to that student's class
- Each fee head shows: Amount, Due Date, Paid Amount, Balance
- Enter payment amount, payment method (Cash/UPI/Card/Bank Transfer), and optional transaction ID
- On save: creates a record in `student_fees` with payment details
- Auto-generates a printable Fee Receipt

**Student Fee Status:**
- Calculate actual Total Due from `fee_structures` (based on student's class) minus payments in `student_fees`
- Show real amounts instead of hardcoded "0.00"
- Show proper status badges: Paid, Partial, Overdue, Pending

**Summary Cards:**
- Today's Collection: sum of `student_fees` paid today
- This Month: sum of `student_fees` paid this month
- Pending Dues: total outstanding across all students

### 3. Fee Receipt Print
- Reuse the existing `PaymentReceipt` component pattern
- Show: Student Name, Admission No, Class, Fee Head breakdown, Amount Paid, Receipt Number, Date
- Print button in the collection dialog after payment

## Technical Details

### Files to Create
1. `src/pages/school/FeeStructureSetup.tsx` -- new page for defining class-wise fee amounts

### Files to Modify
1. `src/pages/school/FeeCollection.tsx` -- full rewrite with working collection dialog, real calculations, receipt printing
2. `src/components/AppSidebar.tsx` -- add "Fee Structures" sidebar link
3. `src/App.tsx` -- add route for `/fee-structures`

### Database
- No new tables needed -- `fee_structures`, `fee_schedules`, and `student_fees` already exist with the right schema
- `fee_structures` stores: organization_id, academic_year_id, class_id, fee_head_id, amount, frequency, due_day, late_fee_amount, late_fee_after_days
- `student_fees` stores: student_id, fee_head_id, amount, paid_amount, paid_date, payment_method, status, etc.

### Flow
1. Admin goes to Fee Heads -- creates Tuition, Transport, Library, etc.
2. Admin goes to Fee Structures -- sets amounts per class (e.g., Class IV Tuition = 5000/month)
3. Admin goes to Fee Collection -- sees students with calculated dues
4. Clicks "Collect" on a student -- pays fees -- gets a receipt
