-- Master -> Transport Master: the shop's transporters (courier / lorry / transport companies),
-- and the transporter chosen for each customer.
--
--   table  transporters                one row per transporter of a shop
--   column customers.transporter_id    the customer's usual transporter (picked in Add Customer)
--
-- customers.transport_details (free text, already printed on invoices) is kept: picking a
-- transporter in Customer Master also writes its name there, so bills print it with no change.
-- transporter_gstin is the 15-character transporter id that e-way bills ask for.
-- Shop members can view, add and edit; a removed transporter is kept (deleted_at) so old
-- customers still show it.
-- Safe to run more than once.
-- UNDO: ALTER TABLE public.customers DROP COLUMN transporter_id;
--       DROP TABLE public.transporters;

CREATE TABLE IF NOT EXISTS public.transporters (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  transporter_name text NOT NULL,
  transporter_gstin text,
  contact_person text,
  phone text,
  alternate_phone text,
  email text,
  address text,
  city text,
  state text,
  pincode text,
  transport_mode text NOT NULL DEFAULT 'road',
  vehicle_number text,
  booking_station text,
  delivery_area text,
  notes text,
  is_active boolean NOT NULL DEFAULT true,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  deleted_at timestamptz,
  CONSTRAINT transporters_name_check CHECK (length(btrim(transporter_name)) BETWEEN 1 AND 120),
  CONSTRAINT transporters_mode_check CHECK (transport_mode IN ('road', 'rail', 'air', 'ship', 'courier')),
  CONSTRAINT transporters_gstin_check CHECK (
    transporter_gstin IS NULL OR transporter_gstin ~ '^[0-9A-Z]{15}$'
  ),
  CONSTRAINT transporters_text_len_check CHECK (
    coalesce(length(contact_person), 0) <= 80 AND coalesce(length(phone), 0) <= 20
    AND coalesce(length(alternate_phone), 0) <= 20 AND coalesce(length(email), 0) <= 120
    AND coalesce(length(address), 0) <= 400 AND coalesce(length(city), 0) <= 60
    AND coalesce(length(state), 0) <= 60 AND coalesce(length(pincode), 0) <= 10
    AND coalesce(length(vehicle_number), 0) <= 20 AND coalesce(length(booking_station), 0) <= 80
    AND coalesce(length(delivery_area), 0) <= 200 AND coalesce(length(notes), 0) <= 500
  )
);

-- One live transporter per name in a shop (a removed one does not block the name).
CREATE UNIQUE INDEX IF NOT EXISTS transporters_org_name_key
  ON public.transporters (organization_id, lower(btrim(transporter_name)))
  WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_transporters_org_active
  ON public.transporters (organization_id, is_active)
  WHERE deleted_at IS NULL;

ALTER TABLE public.transporters ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Org members can view transporters" ON public.transporters;
CREATE POLICY "Org members can view transporters"
  ON public.transporters FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can add transporters" ON public.transporters;
CREATE POLICY "Org members can add transporters"
  ON public.transporters FOR INSERT TO authenticated
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

DROP POLICY IF EXISTS "Org members can edit transporters" ON public.transporters;
CREATE POLICY "Org members can edit transporters"
  ON public.transporters FOR UPDATE TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

REVOKE ALL ON TABLE public.transporters FROM PUBLIC, anon;
GRANT SELECT, INSERT, UPDATE ON TABLE public.transporters TO authenticated;
GRANT ALL ON TABLE public.transporters TO service_role;

CREATE OR REPLACE FUNCTION public.transporters_touch_updated_at()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_transporters_updated_at ON public.transporters;
CREATE TRIGGER trg_transporters_updated_at
  BEFORE UPDATE ON public.transporters
  FOR EACH ROW EXECUTE FUNCTION public.transporters_touch_updated_at();

COMMENT ON TABLE public.transporters IS
  'Master -> Transport Master. Picked for a customer in Customer Master (customers.transporter_id).';

-- The customer's usual transporter.
ALTER TABLE public.customers
  ADD COLUMN IF NOT EXISTS transporter_id uuid REFERENCES public.transporters(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_customers_transporter
  ON public.customers (transporter_id)
  WHERE transporter_id IS NOT NULL;

NOTIFY pgrst, 'reload schema';
