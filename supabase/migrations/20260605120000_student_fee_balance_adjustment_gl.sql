-- Student fee balance adjustments: GL reference type + audit trail columns.

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN (
    'Sale',
    'Purchase',
    'Payment',
    'StudentFeeReceipt',
    'StudentFeeBalanceAdjustment',
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

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_student_fee_adj
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'StudentFeeBalanceAdjustment';

ALTER TABLE public.student_balance_audit
  ADD COLUMN IF NOT EXISTS journal_status text,
  ADD COLUMN IF NOT EXISTS journal_entry_id uuid REFERENCES public.journal_entries(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.student_balance_audit.journal_status IS
  'GL lifecycle: pending, posted, skipped (engine off), error.';
COMMENT ON COLUMN public.student_balance_audit.journal_entry_id IS
  'Posted journal_entries.id when accounting engine recorded this adjustment.';
