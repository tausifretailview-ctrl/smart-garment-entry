-- Security scan (12 Nov 2026, low): anyone could LIST the files in the public
-- bulk-whatsapp-media bucket (every shop's posters), because its read policy allowed
-- SELECT on storage.objects for all roles.
--
-- The bucket stays public: posters are shared by their public link (getPublicUrl), which
-- the WhatsApp server and customers open directly; public-object downloads do not use this
-- policy. The app only uploads (upsert: false) and builds that link. So reading / listing
-- through the API is limited to signed-in members of the shop whose folder it is.
-- UNDO: re-run the bulk_whatsapp_media_read policy from 20270128120000_bulk_whatsapp.sql.

DROP POLICY IF EXISTS bulk_whatsapp_media_read ON storage.objects;
CREATE POLICY bulk_whatsapp_media_read ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'bulk-whatsapp-media'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid())
  );
