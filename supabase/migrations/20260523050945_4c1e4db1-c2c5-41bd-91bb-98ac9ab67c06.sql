
-- 1) Hide portal OTP/session columns from authenticated role (service role still has access)
REVOKE SELECT (portal_otp, portal_otp_expires_at, portal_last_login) ON public.customers FROM authenticated;
REVOKE SELECT (portal_otp, portal_otp_expires_at, portal_last_login) ON public.customers FROM anon;

-- 2) WhatsApp API settings: restrict mutations to admins/managers
DROP POLICY IF EXISTS "Users can insert their organization whatsapp settings" ON public.whatsapp_api_settings;
DROP POLICY IF EXISTS "Users can update their organization whatsapp settings" ON public.whatsapp_api_settings;
DROP POLICY IF EXISTS "Users can delete their organization whatsapp settings" ON public.whatsapp_api_settings;

CREATE POLICY "Admins and managers can insert whatsapp settings"
ON public.whatsapp_api_settings FOR INSERT TO authenticated
WITH CHECK (
  has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
);

CREATE POLICY "Admins and managers can update whatsapp settings"
ON public.whatsapp_api_settings FOR UPDATE TO authenticated
USING (
  has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
)
WITH CHECK (
  has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
);

CREATE POLICY "Admins and managers can delete whatsapp settings"
ON public.whatsapp_api_settings FOR DELETE TO authenticated
USING (
  has_org_role(auth.uid(), organization_id, 'admin'::app_role)
  OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
);

-- 3) invoice-pdfs storage: add UPDATE policy for org members
DROP POLICY IF EXISTS invoice_pdfs_org_members_update ON storage.objects;
CREATE POLICY invoice_pdfs_org_members_update
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'invoice-pdfs'
  AND user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
)
WITH CHECK (
  bucket_id = 'invoice-pdfs'
  AND user_belongs_to_org(auth.uid(), ((storage.foldername(name))[1])::uuid)
);

-- 4) login_attempts: add a DB-level rate limit on anonymous inserts
DROP POLICY IF EXISTS anon_insert_rate_limited ON public.login_attempts;

CREATE OR REPLACE FUNCTION public.login_attempts_rate_ok(_identifier text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE((
    SELECT COUNT(*) < 10
    FROM public.login_attempts
    WHERE identifier = _identifier
      AND created_at > now() - interval '1 minute'
  ), true);
$$;

REVOKE ALL ON FUNCTION public.login_attempts_rate_ok(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.login_attempts_rate_ok(text) TO anon, authenticated;

CREATE POLICY anon_insert_rate_limited
ON public.login_attempts FOR INSERT TO anon, authenticated
WITH CHECK (
  identifier IS NOT NULL
  AND length(identifier) <= 320
  AND public.login_attempts_rate_ok(identifier)
);
