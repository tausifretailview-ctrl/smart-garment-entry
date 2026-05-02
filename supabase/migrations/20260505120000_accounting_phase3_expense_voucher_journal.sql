-- Phase 3: Expense vouchers (Accounts → Expenses) post to journal_entries when app flag is on.

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'Sale',
    'Purchase',
    'Payment',
    'StudentFeeReceipt',
    'ExpenseVoucher'
  ));

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_expense
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'ExpenseVoucher';
