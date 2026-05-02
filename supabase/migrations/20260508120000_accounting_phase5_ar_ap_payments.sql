-- Phase 5: Customer receipts and supplier payments post to journal_entries (AR / AP / cash / settlement discount).

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
    'SupplierPayment'
  ));

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_customer_receipt
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'CustomerReceipt';

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_supplier_payment
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'SupplierPayment';
