-- sale_returns.credit_note_id historically referenced voucher_entries (20260120122520).
-- Application code links sale returns to public.credit_notes (ensureCreditNoteForSaleReturn,
-- AdjustCustomerCreditNoteDialog, POS). Align FK so CN adjust from Sales Invoice does not fail.

ALTER TABLE public.sale_returns DROP CONSTRAINT IF EXISTS sale_returns_credit_note_id_fkey;

UPDATE public.sale_returns sr
SET credit_note_id = NULL
WHERE sr.credit_note_id IS NOT NULL
  AND NOT EXISTS (
    SELECT 1 FROM public.credit_notes cn WHERE cn.id = sr.credit_note_id
  );

ALTER TABLE public.sale_returns
  ADD CONSTRAINT sale_returns_credit_note_id_fkey
  FOREIGN KEY (credit_note_id) REFERENCES public.credit_notes (id) ON DELETE SET NULL;

COMMENT ON COLUMN public.sale_returns.credit_note_id IS 'Linked customer credit_notes row for this sale return (CN path).';
