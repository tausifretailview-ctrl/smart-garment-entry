-- WhatsApp-only shops never print barcodes, so they should not take a barcode series
-- (organizations.organization_number drives the barcode prefix in generate_next_barcode).
-- New WhatsApp-only shops get organization_number NULL; a shop switched to business/school
-- later is given the next free number at that moment.

CREATE OR REPLACE FUNCTION public.organizations_whatsapp_barcode_series()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_type = 'whatsapp' THEN
    IF TG_OP = 'INSERT' THEN
      NEW.organization_number := NULL;
    END IF;
  ELSIF NEW.organization_number IS NULL THEN
    PERFORM pg_advisory_xact_lock(hashtext('organizations.organization_number'));
    SELECT COALESCE(MAX(organization_number), 0) + 1 INTO NEW.organization_number FROM public.organizations;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_organizations_whatsapp_barcode_series ON public.organizations;
CREATE TRIGGER trg_organizations_whatsapp_barcode_series
  BEFORE INSERT OR UPDATE OF organization_type ON public.organizations
  FOR EACH ROW EXECUTE FUNCTION public.organizations_whatsapp_barcode_series();

-- Give back the numbers already taken by WhatsApp-only shops that never made a barcode.
UPDATE public.organizations o
SET organization_number = NULL
WHERE o.organization_type = 'whatsapp'
  AND o.organization_number IS NOT NULL
  AND NOT EXISTS (SELECT 1 FROM public.barcode_sequence b WHERE b.organization_id = o.id)
  AND NOT EXISTS (SELECT 1 FROM public.products p WHERE p.organization_id = o.id);
