
CREATE OR REPLACE FUNCTION public.delete_fee_receipt(p_receipt_id text, p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Delete all student_fees rows matching this receipt
  DELETE FROM public.student_fees
  WHERE payment_receipt_id = p_receipt_id
    AND organization_id = p_organization_id;

  -- Also delete associated voucher entry
  DELETE FROM public.voucher_entries
  WHERE voucher_number = p_receipt_id
    AND organization_id = p_organization_id
    AND reference_type = 'student_fee';
END;
$$;
