-- Industrial mode, Phase 2 step 2b: e-invoice (IRN) for credit notes.
-- A sale return to a registered buyer is the GST credit note (number SR/yy-yy/N, the one
-- GSTR-1 CDNR reports). These nullable columns hold its IRN, the same set sales has.
-- Adding nullable columns with no default only changes the catalogue: no table rewrite,
-- existing rows and every current screen are unchanged. Only Industrial mode shops with
-- E-Invoice Settings on read or write them (einvoice-note edge function).

ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS irn text,
  ADD COLUMN IF NOT EXISTS ack_no text,
  ADD COLUMN IF NOT EXISTS ack_date timestamptz,
  ADD COLUMN IF NOT EXISTS signed_invoice text,
  ADD COLUMN IF NOT EXISTS einvoice_qr_code text,
  ADD COLUMN IF NOT EXISTS einvoice_status text,
  ADD COLUMN IF NOT EXISTS einvoice_error text,
  ADD COLUMN IF NOT EXISTS einvoice_test_mode boolean;

COMMENT ON COLUMN public.sale_returns.irn IS
  'Industrial mode: IRN of this credit note (DocDtls.Typ CRN); einvoice_status generated | failed | cancelled';
