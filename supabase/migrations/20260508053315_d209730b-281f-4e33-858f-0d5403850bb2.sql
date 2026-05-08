
-- 1. Fix supplier-bill-images storage policies: restrict INSERT/DELETE to org members
DROP POLICY IF EXISTS "Allow authenticated uploads to supplier-bill-images" ON storage.objects;
DROP POLICY IF EXISTS "Allow authenticated delete of supplier-bill-images" ON storage.objects;

CREATE POLICY "supplier_bills_org_members_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'supplier-bill-images'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "supplier_bills_org_members_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'supplier-bill-images'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

-- 2. Fix invoice-pdfs DELETE policy
DROP POLICY IF EXISTS "Organization members can delete invoice PDFs" ON storage.objects;
DROP POLICY IF EXISTS "Organization members can upload invoice PDFs" ON storage.objects;

CREATE POLICY "invoice_pdfs_org_members_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'invoice-pdfs'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "invoice_pdfs_org_members_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

-- 3. Fix company-logos DELETE/UPDATE policies
DROP POLICY IF EXISTS "Authenticated users can delete company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update company logos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can upload company logos" ON storage.objects;

CREATE POLICY "company_logos_org_members_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "company_logos_org_members_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "company_logos_org_members_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'company-logos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

-- 4. Fix product-images DELETE/UPDATE policies
DROP POLICY IF EXISTS "Authenticated can delete product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can update product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated can upload product images" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update product images" ON storage.objects;

CREATE POLICY "product_images_org_members_insert" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_org_members_update" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "product_images_org_members_delete" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-images'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid()
    )
  );

-- 5. Drop the global purchase_items policy (org-scoped policies remain)
DROP POLICY IF EXISTS "Admins and managers can access purchase_items" ON public.purchase_items;

-- 6. Restrict user_roles INSERT to platform_admin only (prevent admin self-escalation)
DROP POLICY IF EXISTS "Admins can insert roles for users" ON public.user_roles;
CREATE POLICY "Platform admins can insert roles" ON public.user_roles
  FOR INSERT TO authenticated
  WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

DROP POLICY IF EXISTS "Admins can delete roles" ON public.user_roles;
CREATE POLICY "Platform admins can delete roles" ON public.user_roles
  FOR DELETE TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role));

DROP POLICY IF EXISTS "Admins can update roles" ON public.user_roles;
CREATE POLICY "Platform admins can update roles" ON public.user_roles
  FOR UPDATE TO authenticated
  USING (has_role(auth.uid(), 'platform_admin'::app_role));

-- 7. Fix organization_members self-insert privilege escalation
DROP POLICY IF EXISTS "Users can add themselves as organization members" ON public.organization_members;
-- Removed entirely - only org admins or platform_admins can add members (existing policies cover this)

-- 8. Restrict whatsapp_api_settings SELECT to admin/manager only
DROP POLICY IF EXISTS "Org members can view whatsapp settings" ON public.whatsapp_api_settings;
CREATE POLICY "Admins and managers can view whatsapp settings" ON public.whatsapp_api_settings
  FOR SELECT TO authenticated
  USING (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  );

-- 9. Restrict payment_gateway_settings SELECT to admin/manager only
DROP POLICY IF EXISTS "Users can view gateway settings in their organizations" ON public.payment_gateway_settings;
CREATE POLICY "Admins and managers can view gateway settings" ON public.payment_gateway_settings
  FOR SELECT TO authenticated
  USING (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  );
