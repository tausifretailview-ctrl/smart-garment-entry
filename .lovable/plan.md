

## Student Account Ledger in Customer Ledger

### Problem
In School ERP, students are synced to the `customers` table via a database trigger, so they appear in the Customer Ledger list. However, their fee transactions (stored in `student_fees` and `voucher_entries` with `reference_type: "student_fee"`) are not displayed because the ledger only looks at `sales` and sale-related vouchers.

### Solution
Enhance the `CustomerLedger.tsx` component to detect school organizations and include student fee transactions in the ledger view.

### Changes

**File: `src/components/CustomerLedger.tsx`**

1. **Import `useSchoolFeatures` hook** to detect if the current org is a school

2. **Modify the customer list query** (lines ~79-161):
   - For school orgs, also fetch each customer's linked `student_id` from the `students` table (via `customer_id` foreign key)
   - Include student fee totals (from `student_fees`) in the balance calculation for school customers
   - For school orgs: Balance = closing_fees_balance - total_fees_paid (instead of sales-based calculation)

3. **Modify the transaction detail query** (lines ~174-496):
   - When a customer is selected and org is a school, look up the linked student record using `customer_id`
   - Fetch `student_fees` for that student (with fee head names via join to `fee_heads`)
   - Fetch `voucher_entries` where `reference_type = 'student_fee'` and `reference_id = student.id`
   - Add fee entries as **debit** transactions (fees charged) -- using the fee `amount` field
   - Add fee payment vouchers as **credit** transactions (fees paid) -- using `paid_amount`
   - Use `closing_fees_balance` as the opening balance for school students
   - Sort all entries chronologically alongside any existing sales transactions

4. **Update the customer summary card** (shown when a customer is selected):
   - For school orgs, show "Total Fees" instead of "Total Sales"
   - Show "Fees Paid" instead of "Total Paid"
   - Show student details (admission number, class) if available

5. **Transaction type handling**:
   - Add a new transaction type `'fee'` to the Transaction interface
   - Fee charge entries: type='fee', reference=receipt number, description includes fee head name
   - Fee payment entries: already handled via voucher_entries (reference_type='student_fee')
   - Ensure proper running balance calculation with fee entries

### How the Data Flows

```text
Student (students table)
  |-- customer_id --> Customer (customers table) <-- shown in Customer Ledger
  |-- student_fees --> Fee charges (debit entries)
  |-- voucher_entries (reference_type='student_fee') --> Fee payments (credit entries)
```

### Balance Formula for School Students
- Opening Balance = `closing_fees_balance` from student record
- Debit = Fee amounts charged (from `student_fees.amount`)
- Credit = Fee payments (from `student_fees.paid_amount` or voucher entries)
- Running Balance = Opening + Sum(Debits) - Sum(Credits)

### Files to Modify
- `src/components/CustomerLedger.tsx` -- main changes to support student fee transactions

