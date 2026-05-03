-- Phase 6: Sale return and purchase return post to journal_entries (returns / COGS / AR or cash; AP / COGS).

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

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_sale_return
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'SaleReturn';

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_purchase_return
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'PurchaseReturn';
