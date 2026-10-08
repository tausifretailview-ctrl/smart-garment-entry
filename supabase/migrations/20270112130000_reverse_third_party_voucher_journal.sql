-- Deleting a third-party voucher no longer reversed its journal: the reversal list in
-- 20261123121000 dropped 'ThirdPartyVoucher', which the earlier purge list (20260827150000)
-- included. Same function, with ThirdPartyVoucher added back.

CREATE OR REPLACE FUNCTION public.post_journal_reversal_for_voucher_ref(p_org uuid, p_voucher_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  v_new_id uuid;
  v_desc text;
BEGIN
  IF p_org IS NULL OR p_voucher_id IS NULL THEN
    RETURN;
  END IF;

  FOR r IN
    SELECT je.*
    FROM public.journal_entries je
    WHERE je.organization_id = p_org
      AND je.reference_id = p_voucher_id
      AND je.reference_type IN (
        'CustomerReceipt',
        'SupplierPayment',
        'ExpenseVoucher',
        'SalaryVoucher',
        'StudentFeeReceipt',
        'CustomerCreditNoteApplication',
        'CustomerAdvanceApplication',
        'Payment',
        'ThirdPartyVoucher'
      )
      AND je.reversed_journal_id IS NULL
      AND NOT EXISTS (
        SELECT 1
        FROM public.journal_entries rev
        WHERE rev.reversed_journal_id = je.id
      )
  LOOP
    v_desc := left('REVERSAL: ' || coalesce(r.description, r.id::text), 500);

    INSERT INTO public.journal_entries (
      organization_id,
      date,
      reference_type,
      reference_id,
      description,
      total_amount,
      reversed_journal_id
    )
    VALUES (
      r.organization_id,
      r.date,
      r.reference_type,
      r.reference_id,
      v_desc,
      r.total_amount,
      r.id
    )
    RETURNING id INTO v_new_id;

    INSERT INTO public.journal_lines (
      journal_entry_id,
      account_id,
      debit_amount,
      credit_amount,
      party_type,
      party_id,
      party_name_snapshot
    )
    SELECT
      v_new_id,
      jl.account_id,
      jl.credit_amount,
      jl.debit_amount,
      jl.party_type,
      jl.party_id,
      jl.party_name_snapshot
    FROM public.journal_lines jl
    WHERE jl.journal_entry_id = r.id;
  END LOOP;
END;
$$;

REVOKE ALL ON FUNCTION public.post_journal_reversal_for_voucher_ref(uuid, uuid) FROM public, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.post_journal_reversal_for_voucher_ref(uuid, uuid) TO service_role;
