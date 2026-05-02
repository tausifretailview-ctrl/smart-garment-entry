-- Phase 4: Employee salary payment vouchers post to journal_entries when app flag is on.
-- Journal reference_id = voucher_entries.id (not employee id).

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
    'SalaryVoucher'
  ));

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_salary
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'SalaryVoucher';
