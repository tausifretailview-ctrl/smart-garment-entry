-- Industrial mode, Phase 2 step 1: sales debit notes.
-- A debit note is a sales row with sale_type 'debit_note' (number DN/yy-yy/N, no stock lines),
-- so party balance, customer ledger, outstanding and receipts already count it.
-- Its GST lines and the original invoice live in the new nullable debit_note_details jsonb.
-- Existing rows are unchanged; only Industrial mode shops create debit notes.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS debit_note_details jsonb;

-- Allow the new sale type. NOT VALID skips re-checking old rows (they already meet the
-- narrower rule), so the change does not scan the sales table while shops bill.
ALTER TABLE public.sales DROP CONSTRAINT IF EXISTS sales_sale_type_check;
ALTER TABLE public.sales ADD CONSTRAINT sales_sale_type_check
  CHECK (sale_type = ANY (ARRAY['pos', 'invoice', 'delivery_challan', 'debit_note'])) NOT VALID;

COMMENT ON COLUMN public.sales.debit_note_details IS
  'Industrial mode debit note: original invoice, reason, GST lines (sale_type = debit_note only)';
