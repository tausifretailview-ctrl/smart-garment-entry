-- 1. Lock down leftover import staging table (empty, unused by the app)
ALTER TABLE public.klear_trading_import_staging ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.klear_trading_import_staging FROM anon, authenticated;
GRANT ALL ON public.klear_trading_import_staging TO service_role;

-- 2. Bind website-photos writes to the caller's organization (path = <org_id>/...)
DROP POLICY IF EXISTS "Authenticated users can upload website photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update website photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete website photos" ON storage.objects;

CREATE POLICY "website_photos_org_members_insert"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'website-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "website_photos_org_members_update"
  ON storage.objects FOR UPDATE TO authenticated
  USING (
    bucket_id = 'website-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  )
  WITH CHECK (
    bucket_id = 'website-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "website_photos_org_members_delete"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'website-photos'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );