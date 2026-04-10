

## Fix: Exclude Soft-Deleted Fee Receipts from All Queries

### Problem
The recent soft-delete fix for fee receipts (setting `status = 'deleted'`) only works if all queries filter out deleted records. Several queries across the codebase do NOT filter by status, meaning deleted receipts still appear in ledgers, balance calculations, and reports.

### Affected Files (6 locations need fixing)

| File | Line | Issue |
|------|------|-------|
| **CustomerLedger.tsx** ~line 157 | Fetches all `student_fees` without status filter | Deleted fees counted in student balance list |
| **CustomerLedger.tsx** ~line 463 | Fetches student fees for ledger view without status filter | Deleted receipts appear in ledger timeline |
| **CustomerHistoryDialog.tsx** ~line 338 | Fetches `paid_amount` without status filter | Deleted fees inflate "fees paid" total |
| **FeeReceiptReprintDialog.tsx** ~line 30 | Fetches receipt by ID without status filter | Can reprint deleted receipts |
| **FeeReceiptReprintDialog.tsx** ~line 45 | Fetches `allFees` without status filter | Balance calc includes deleted amounts |
| **StudentPromotion.tsx** ~line 163 | Fetches paid amounts without status filter | Promotion screen shows wrong paid totals |

### Fix (all 6 locations)

Add `.neq("status", "deleted")` to each query. Specific changes:

1. **CustomerLedger.tsx line ~159**: Add `.neq("status", "deleted")` after `.eq("organization_id", organizationId)`
2. **CustomerLedger.tsx line ~467**: Add `.neq("status", "deleted")` after `.eq("organization_id", organizationId)`
3. **CustomerHistoryDialog.tsx line ~342**: Add `.neq("status", "deleted")` after `.eq("organization_id", organizationId)`
4. **FeeReceiptReprintDialog.tsx line ~34**: Add `.neq("status", "deleted")` after `.eq("payment_receipt_id", receiptId)`
5. **FeeReceiptReprintDialog.tsx line ~49**: Add `.neq("status", "deleted")` after `.eq("organization_id", currentOrganization.id)`
6. **StudentPromotion.tsx line ~168**: Add `.neq("status", "deleted")` after `.gt("paid_amount", 0)`

### What Won't Change
- StudentHistoryDialog (already filters `.in("status", ["paid", "partial"])`)
- FeeCollectionDialog (already filters correctly)
- FeeCollection dashboard queries (already filter correctly)

