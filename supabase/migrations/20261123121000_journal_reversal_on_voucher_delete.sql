-- Voucher correction must reverse journals, not erase them.
-- journal_entries has no metadata/debit/credit columns (those live on journal_lines),
-- so we add reversed_journal_id and append a header + swapped lines.

ALTER TABLE public.journal_entries
  ADD COLUMN IF NOT EXISTS reversed_journal_id uuid REFERENCES public.journal_entries(id);

COMMENT ON COLUMN public.journal_entries.reversed_journal_id IS
  'When set, this row is a reversing journal of the referenced original. Originals are never updated.';

CREATE UNIQUE INDEX IF NOT EXISTS idx_journal_entries_reversal_of_unique
  ON public.journal_entries (reversed_journal_id)
  WHERE reversed_journal_id IS NOT NULL;

DROP INDEX IF EXISTS public.idx_journal_entries_org_ref_unique;

CREATE INDEX IF NOT EXISTS idx_journal_entries_org_ref
  ON public.journal_entries (organization_id, reference_type, reference_id)
  WHERE reference_id IS NOT NULL;

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
        'Payment'
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

CREATE OR REPLACE FUNCTION public.purge_journal_on_voucher_soft_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_reversal_for_voucher_ref(NEW.organization_id, NEW.id);
  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.purge_journal_on_voucher_hard_delete()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.post_journal_reversal_for_voucher_ref(OLD.organization_id, OLD.id);
  RETURN OLD;
END;
$$;
