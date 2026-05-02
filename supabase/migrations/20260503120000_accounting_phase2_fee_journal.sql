-- Phase 2: School fee receipts can post to chart_of_accounts / journal_entries when engine is enabled (app-side flag).

ALTER TABLE public.journal_entries
  DROP CONSTRAINT IF EXISTS journal_entries_reference_type_check;

ALTER TABLE public.journal_entries
  ADD CONSTRAINT journal_entries_reference_type_check
  CHECK (reference_type IN ('Sale', 'Purchase', 'Payment', 'StudentFeeReceipt'));

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref_fee
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_type = 'StudentFeeReceipt';

CREATE OR REPLACE FUNCTION public.delete_fee_receipt(p_receipt_id text, p_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fee RECORD;
BEGIN
  FOR v_fee IN
    SELECT id, student_id, paid_amount, fee_head_id, payment_method, paid_date, academic_year_id
    FROM student_fees
    WHERE payment_receipt_id = p_receipt_id
      AND organization_id = p_organization_id
  LOOP
    INSERT INTO student_balance_audit (
      organization_id, student_id, academic_year_id, adjustment_type,
      old_balance, new_balance, change_amount,
      reason_code, reason_code_label, voucher_number, created_at
    ) VALUES (
      p_organization_id, v_fee.student_id, v_fee.academic_year_id, 'debit',
      0, 0, v_fee.paid_amount,
      'receipt_deleted',
      'Receipt Deleted: ' || p_receipt_id || ' (₹' || v_fee.paid_amount || ')',
      'DEL-' || p_receipt_id, now()
    );
  END LOOP;

  UPDATE student_fees
  SET status = 'deleted', updated_at = now()
  WHERE payment_receipt_id = p_receipt_id
    AND organization_id = p_organization_id;

  DELETE FROM public.student_ledger_entries
  WHERE organization_id = p_organization_id
    AND voucher_no = p_receipt_id
    AND voucher_type = 'FEE_RECEIPT';

  -- Phase 2: remove chart journal tied to this fee voucher (lines cascade).
  DELETE FROM public.journal_entries
  WHERE organization_id = p_organization_id
    AND reference_type = 'StudentFeeReceipt'
    AND reference_id IN (
      SELECT id FROM public.voucher_entries
      WHERE voucher_number = p_receipt_id
        AND organization_id = p_organization_id
        AND reference_type = 'student_fee'
    );

  DELETE FROM public.voucher_items
  WHERE voucher_id IN (
    SELECT id FROM public.voucher_entries
    WHERE voucher_number = p_receipt_id
      AND organization_id = p_organization_id
      AND reference_type = 'student_fee'
  );

  UPDATE voucher_entries
  SET deleted_at = now()
  WHERE voucher_number = p_receipt_id
    AND organization_id = p_organization_id
    AND reference_type = 'student_fee';
END;
$$;
