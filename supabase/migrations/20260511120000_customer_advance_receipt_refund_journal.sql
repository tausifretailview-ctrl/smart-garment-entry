-- Customer advance: cash received (DR Cash/Bank, CR Customer Advances) and refund paid (DR Customer Advances, CR Cash/Bank).

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
    'CustomerAdvanceRefund'
  ));

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_cust_adv_rcpt
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'CustomerAdvanceReceipt';

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_cust_adv_refund
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'CustomerAdvanceRefund';
