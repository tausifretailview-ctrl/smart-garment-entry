-- Fix Sale Return / Purchase Return GL posting when journal_entries.reference_type CHECK
-- is missing 'SaleReturn' / 'PurchaseReturn' (e.g. 20260511120000 applied after phase6, or partial deploy).
-- Matches app: src/utils/accounting/journalService.ts JournalReferenceType + postJournalEntry.

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'Sale',
    'Purchase',
    'Payment',
    'StudentFeeReceipt',
    'ExpenseVoucher',
    'SalaryVoucher',
    'CustomerReceipt',
    'SupplierPayment',
    'CustomerAdvanceApplication',
    'CustomerCreditNoteApplication',
    'CustomerAdvanceReceipt',
    'CustomerAdvanceRefund',
    'SaleReturn',
    'PurchaseReturn'
  ));
