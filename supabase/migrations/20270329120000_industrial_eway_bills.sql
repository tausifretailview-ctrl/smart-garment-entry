-- Industrial mode, Phase 2 step 4: e-way bills.
-- A new table, so no existing table, row or screen changes. Rows are written only by the
-- eway-bill edge function (service role), for Industrial mode shops with E-Invoice Settings on.
-- Step 4 makes them from a sale bill's IRN; later steps add the vehicle updates, cancel,
-- extend, and e-way bills for challans and purchase returns in the same table.

CREATE TABLE IF NOT EXISTS public.eway_bills (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  doc_type text NOT NULL DEFAULT 'INV',
  doc_no text,
  doc_date date,
  irn text,
  ewb_no text NOT NULL,
  ewb_date timestamptz,
  valid_till timestamptz,
  status text NOT NULL DEFAULT 'active',
  generated_via text NOT NULL DEFAULT 'irn',
  trans_mode text,
  distance_km integer,
  transporter_id text,
  transporter_name text,
  vehicle_no text,
  vehicle_type text,
  trans_doc_no text,
  trans_doc_date date,
  test_mode boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.eway_bills DROP CONSTRAINT IF EXISTS eway_bills_status_check;
ALTER TABLE public.eway_bills
  ADD CONSTRAINT eway_bills_status_check CHECK (status IN ('active', 'cancelled'));

ALTER TABLE public.eway_bills DROP CONSTRAINT IF EXISTS eway_bills_generated_via_check;
ALTER TABLE public.eway_bills
  ADD CONSTRAINT eway_bills_generated_via_check CHECK (generated_via IN ('irn', 'direct'));

CREATE UNIQUE INDEX IF NOT EXISTS eway_bills_org_ewb_no_key
  ON public.eway_bills (organization_id, ewb_no, test_mode);

CREATE INDEX IF NOT EXISTS idx_eway_bills_sale
  ON public.eway_bills (sale_id)
  WHERE sale_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_eway_bills_org_status_valid
  ON public.eway_bills (organization_id, status, valid_till);

COMMENT ON TABLE public.eway_bills IS
  'Industrial mode: e-way bills (EWB). generated_via irn = from the sale bill e-invoice; status active | cancelled';

ALTER TABLE public.eway_bills ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view e-way bills" ON public.eway_bills;
CREATE POLICY "Org members can view e-way bills"
ON public.eway_bills FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));
