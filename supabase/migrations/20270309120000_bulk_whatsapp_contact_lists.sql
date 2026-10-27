-- Bulk WhatsApp saved contact lists: the numbers on the send page (Excel, typed or Customer Master)
-- saved under a name, picked next time instead of importing again. Everyone in the shop sees the
-- shop's lists; the person who saved one, or an org admin, can rename, update or delete it.
-- contacts = [{"phone":"919876543210","name":"Ravi","wa":true}], wa = already checked on WhatsApp.

CREATE TABLE IF NOT EXISTS public.bulk_whatsapp_contact_lists (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL DEFAULT auth.uid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 80),
  contacts jsonb NOT NULL DEFAULT '[]'::jsonb CHECK (jsonb_typeof(contacts) = 'array' AND jsonb_array_length(contacts) <= 5000),
  contact_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS bulk_whatsapp_contact_lists_name_uq
  ON public.bulk_whatsapp_contact_lists (organization_id, lower(btrim(name)));

-- Count and updated time always match the saved numbers, whoever writes the row.
CREATE OR REPLACE FUNCTION public.bulk_whatsapp_contact_lists_touch()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  NEW.contact_count := jsonb_array_length(NEW.contacts);
  NEW.updated_at := now();
  IF TG_OP = 'UPDATE' THEN
    NEW.organization_id := OLD.organization_id;
    NEW.user_id := OLD.user_id;
    NEW.created_at := OLD.created_at;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS bulk_whatsapp_contact_lists_touch ON public.bulk_whatsapp_contact_lists;
CREATE TRIGGER bulk_whatsapp_contact_lists_touch
  BEFORE INSERT OR UPDATE ON public.bulk_whatsapp_contact_lists
  FOR EACH ROW EXECUTE FUNCTION public.bulk_whatsapp_contact_lists_touch();

ALTER TABLE public.bulk_whatsapp_contact_lists ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS bulk_whatsapp_contact_lists_select ON public.bulk_whatsapp_contact_lists;
CREATE POLICY bulk_whatsapp_contact_lists_select ON public.bulk_whatsapp_contact_lists
  FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = bulk_whatsapp_contact_lists.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS bulk_whatsapp_contact_lists_insert ON public.bulk_whatsapp_contact_lists;
CREATE POLICY bulk_whatsapp_contact_lists_insert ON public.bulk_whatsapp_contact_lists
  FOR INSERT TO authenticated
  WITH CHECK (
    user_id = auth.uid()
    AND EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = bulk_whatsapp_contact_lists.organization_id
        AND om.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS bulk_whatsapp_contact_lists_update ON public.bulk_whatsapp_contact_lists;
CREATE POLICY bulk_whatsapp_contact_lists_update ON public.bulk_whatsapp_contact_lists
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  )
  WITH CHECK (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

DROP POLICY IF EXISTS bulk_whatsapp_contact_lists_delete ON public.bulk_whatsapp_contact_lists;
CREATE POLICY bulk_whatsapp_contact_lists_delete ON public.bulk_whatsapp_contact_lists
  FOR DELETE TO authenticated
  USING (
    user_id = auth.uid()
    OR public.has_org_role(auth.uid(), organization_id, 'admin'::public.app_role)
  );

GRANT SELECT, INSERT, UPDATE, DELETE ON public.bulk_whatsapp_contact_lists TO authenticated;
