

## School ERP: Fix Duplicate Fee Receipts (5 Students)

### What Happened

On 09/03/2026, fees were collected for 5 students, but each was entered **twice** — once in the morning batch (receipts 25-29) and again in a later batch (receipts 30-37). This doubled the recorded payments and inflated collection totals.

### Affected Students

| Student | Original Receipt | Duplicate Receipt | Amount |
|---------|-----------------|-------------------|--------|
| MST. ARUSH AJAY SHELKE | RCT/2025-26/26 (₹6,000) | RCT/2025-26/30 | ₹6,000 |
| MST. GITESH MAHESH MOKAL | RCT/2025-26/27 (₹3,000) | RCT/2025-26/32 | ₹3,000 |
| MST. VIHAAN RAMCHANDRA SHARMA | RCT/2025-26/28 (₹4,000) | RCT/2025-26/33 | ₹4,000 |
| MST. VEDANT SANDESH MODSING | RCT/2025-26/25 (₹8,000) | RCT/2025-26/36 | ₹8,000 |
| MS. HANSIKA LAXMAN KAMBLE | RCT/2025-26/29 (₹8,000) | RCT/2025-26/37 | ₹8,000 |

**Total over-recorded: ₹29,000**

### Fix Plan

**Step 1: Database migration** to soft-delete the 5 duplicate `student_fees` records and their matching `voucher_entries`:

- Set `status = 'deleted'` on the 5 duplicate `student_fees` rows (IDs identified above)
- Set `deleted_at = now()` on the 5 matching `voucher_entries` (by receipt number)
- Insert audit trail entries in `student_balance_audit` for each deletion

**Step 2: Add duplicate prevention** in `FeeCollectionDialog.tsx`:

- Before inserting a new fee record, check if a record with the same `student_id + paid_date + paid_amount + fee_head_id` already exists (within the last 5 minutes) — if so, warn the user and block submission unless confirmed

### No Code File Changes Needed for Data Fix

The data cleanup is purely a SQL migration. The duplicate prevention guard is the only code change.

### Technical Details

The migration SQL will:
1. Soft-delete 5 `student_fees` rows by their specific IDs
2. Soft-delete 5 `voucher_entries` by matching receipt numbers (RCT/2025-26/30, 32, 33, 36, 37)
3. Create audit records documenting each deletion with reason "duplicate_receipt_cleanup"

