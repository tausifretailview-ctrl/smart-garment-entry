-- Phase 2 step 6b: e-way bills for delivery challans (and, for step 6c, purchase returns).
-- Adds nullable link columns to public.eway_bills only: no existing row, table or screen changes.
-- Rows are still written only by the eway-bill edge function (service role).

ALTER TABLE public.eway_bills
  ADD COLUMN IF NOT EXISTS challan_id uuid REFERENCES public.delivery_challans(id) ON DELETE SET NULL;

ALTER TABLE public.eway_bills
  ADD COLUMN IF NOT EXISTS purchase_return_id uuid REFERENCES public.purchase_returns(id) ON DELETE SET NULL;

-- NIC outward sub supply type of a challan's e-way bill (4 job work, 5 own use, 8 others…) and the "others" reason.
ALTER TABLE public.eway_bills ADD COLUMN IF NOT EXISTS sub_supply_type text;
ALTER TABLE public.eway_bills ADD COLUMN IF NOT EXISTS sub_supply_desc text;

CREATE INDEX IF NOT EXISTS idx_eway_bills_challan
  ON public.eway_bills (challan_id)
  WHERE challan_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eway_bills_purchase_return
  ON public.eway_bills (purchase_return_id)
  WHERE purchase_return_id IS NOT NULL;

COMMENT ON COLUMN public.eway_bills.challan_id IS 'Delivery challan this e-way bill was made for (document type CHL)';
COMMENT ON COLUMN public.eway_bills.purchase_return_id IS 'Purchase return this e-way bill was made for';
