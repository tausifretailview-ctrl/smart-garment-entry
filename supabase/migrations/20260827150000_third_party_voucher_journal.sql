-- Third-party voucher GL reference + recycle-bin journal purge parity with expense/salary.

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
    'PurchaseReturn',
    'ManualJournal',
    'ThirdPartyVoucher',
    'Contra',
    'RoundOff'
  ));

CREATE OR REPLACE FUNCTION public.purge_journals_for_voucher_ref(p_org uuid, p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.journal_entries
  WHERE organization_id = p_org
    AND reference_id = p_voucher_id
    AND reference_type IN (
      'CustomerReceipt',
      'SupplierPayment',
      'ExpenseVoucher',
      'SalaryVoucher',
      'StudentFeeReceipt',
      'CustomerCreditNoteApplication',
      'CustomerAdvanceApplication',
      'Payment',
      'ThirdPartyVoucher'
    );
END;
$$;

REVOKE EXECUTE ON FUNCTION public.purge_journals_for_voucher_ref(uuid, uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.purge_journals_for_voucher_ref(uuid, uuid) TO authenticated, service_role;
