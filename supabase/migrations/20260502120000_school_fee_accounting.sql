-- Student sub-ledger (Tally-style party book) + fee head → income ledger mapping.
-- Reversal: public.delete_fee_receipt removes voucher_items, student_ledger_entries, soft-deletes voucher.

CREATE TABLE IF NOT EXISTS public.student_ledger_entries (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  voucher_type TEXT NOT NULL,
  voucher_no TEXT,
  particulars TEXT,
  transaction_date DATE,
  debit NUMERIC NOT NULL DEFAULT 0,
  credit NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID REFERENCES auth.users(id)
);

CREATE INDEX IF NOT EXISTS idx_student_ledger_org_student
  ON public.student_ledger_entries(organization_id, student_id);

CREATE INDEX IF NOT EXISTS idx_student_ledger_voucher_no
  ON public.student_ledger_entries(organization_id, voucher_no);

ALTER TABLE public.student_ledger_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view student ledger entries"
ON public.student_ledger_entries FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert student ledger entries"
ON public.student_ledger_entries FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can update student ledger entries"
ON public.student_ledger_entries FOR UPDATE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can delete student ledger entries"
ON public.student_ledger_entries FOR DELETE
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

ALTER TABLE public.fee_heads
  ADD COLUMN IF NOT EXISTS income_account_id UUID REFERENCES public.account_ledgers(id) ON DELETE SET NULL;

COMMENT ON COLUMN public.fee_heads.income_account_id IS 'Optional chart (account_ledgers) income account for voucher_items credit when this fee head is collected.';

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
