ALTER TABLE public.journal_entries DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;
ALTER TABLE public.journal_entries ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type = ANY (ARRAY[
    'Sale'::text, 'Purchase'::text, 'Payment'::text,
    'StudentFeeReceipt'::text, 'StudentFeeBalanceAdjustment'::text,
    'ExpenseVoucher'::text, 'SalaryVoucher'::text,
    'CustomerReceipt'::text, 'SupplierPayment'::text,
    'CustomerAdvanceApplication'::text, 'CustomerCreditNoteApplication'::text,
    'CustomerAdvanceReceipt'::text, 'CustomerAdvanceRefund'::text,
    'SaleReturn'::text, 'PurchaseReturn'::text
  ]));