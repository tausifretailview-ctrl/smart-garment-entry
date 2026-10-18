-- WhatsApp-only shops: organizations that use only the separate Bulk WhatsApp site (no ERP).
-- Created from Platform Admin with type "WhatsApp only"; the ERP sends their users to that site.
CREATE OR REPLACE FUNCTION public.check_organization_type()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.organization_type NOT IN ('business', 'school', 'whatsapp') THEN
    RAISE EXCEPTION 'Invalid organization_type. Must be business, school or whatsapp.';
  END IF;
  RETURN NEW;
END;
$$;
