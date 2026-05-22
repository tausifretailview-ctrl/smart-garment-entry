-- When the purchase bill was saved in EzzyERP (invoice making date & time), distinct from supplier bill_date.
ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS bill_entry_at timestamptz;

UPDATE public.purchase_bills
SET bill_entry_at = created_at
WHERE bill_entry_at IS NULL;

ALTER TABLE public.purchase_bills
  ALTER COLUMN bill_entry_at SET DEFAULT now();

COMMENT ON COLUMN public.purchase_bills.bill_entry_at IS
  'Timestamp when this purchase bill was first saved in the app (entry/making time).';

CREATE INDEX IF NOT EXISTS idx_purchase_bills_org_entry_at
  ON public.purchase_bills (organization_id, bill_entry_at DESC NULLS LAST)
  WHERE deleted_at IS NULL;
