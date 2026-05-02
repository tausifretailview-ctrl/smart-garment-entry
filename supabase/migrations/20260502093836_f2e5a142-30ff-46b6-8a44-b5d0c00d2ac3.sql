CREATE OR REPLACE FUNCTION public.delete_fee_receipt(p_receipt_id text, p_organization_id uuid)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
DECLARE
  v_fee RECORD;
BEGIN
  -- Record audit trail BEFORE deleting (year-scoped, traceability only — not used in balance math)
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

  -- Soft-delete student_fees rows (this alone restores the due correctly)
  UPDATE student_fees
  SET status = 'deleted', updated_at = now()
  WHERE payment_receipt_id = p_receipt_id
    AND organization_id = p_organization_id;

  -- Soft-delete associated voucher entry (this alone removes the credit from customer ledger)
  UPDATE voucher_entries
  SET deleted_at = now()
  WHERE voucher_number = p_receipt_id
    AND organization_id = p_organization_id
    AND reference_type = 'student_fee';
END;
$$;