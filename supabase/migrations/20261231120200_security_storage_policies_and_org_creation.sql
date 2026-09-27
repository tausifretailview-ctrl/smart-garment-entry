-- SECURITY REVIEW 2026-09-27 · FIX-3 (four small database fixes)
-- 1) A user of one business can overwrite or delete another
-- business's storefront photos (policies only check the bucket name).
-- Uploads already use the path  {organization_id}/{listing_id}/{timestamp}.jpg
-- (src/pages/WebsiteSettings.tsx:1282), so scoping to the first folder changes nothing for
-- legitimate users. Public viewing of photos is untouched.


DROP POLICY IF EXISTS "Authenticated users can upload website photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update website photos" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete website photos" ON storage.objects;
DROP POLICY IF EXISTS "website_photos_org_members_insert" ON storage.objects;
DROP POLICY IF EXISTS "website_photos_org_members_update" ON storage.objects;
DROP POLICY IF EXISTS "website_photos_org_members_delete" ON storage.objects;

CREATE POLICY "website_photos_org_members_insert" ON storage.objects
FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'website-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid())
);

CREATE POLICY "website_photos_org_members_update" ON storage.objects
FOR UPDATE TO authenticated
USING (
  bucket_id = 'website-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid())
);

CREATE POLICY "website_photos_org_members_delete" ON storage.objects
FOR DELETE TO authenticated
USING (
  bucket_id = 'website-photos'
  AND (storage.foldername(name))[1] IN (
    SELECT om.organization_id::text FROM public.organization_members om WHERE om.user_id = auth.uid())
);

-- 2) Any logged-in user can currently create a new organisation (old catch-all policy left behind
-- when org creation was limited to platform admins on 12 Sep 2026). Remove it; the
-- platform-admin policy stays.
DROP POLICY IF EXISTS "organizations_insert_policy" ON public.organizations;

-- 3) create_organization(p_name, p_user_id) trusts the caller-supplied p_user_id, so any
--    logged-in user can make ANY account the admin of a new organisation (and give it the
--    global 'admin' role). Force it to the caller.
-- 4) platform_create_organization(...) has no platform-admin check at all: any logged-in user
--    can create a 'professional' tier organisation and make any email its admin.
-- Both edit the LIVE definition (one line added after BEGIN); SQL editor / service role unchanged.
DO $fix3$
DECLARE
  r record;
  v_src text;
  v_def text;
  v_pos int;
  v_line text;
BEGIN
  FOR r IN SELECT p.oid, p.proname FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
           WHERE n.nspname = 'public'
             AND p.proname IN ('create_organization', 'platform_create_organization')
             AND p.prosrc !~ 'security review 2026-09-27'
             -- an older overload already checks platform_admin; leave it
             AND NOT (p.proname = 'platform_create_organization' AND p.prosrc ~ 'platform_admin')
  LOOP
    IF r.proname = 'create_organization' THEN
      v_line := '  IF auth.uid() IS NOT NULL THEN p_user_id := auth.uid(); END IF;';
    ELSE
      v_line := '  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), ''platform_admin''::app_role) THEN' || E'\n'
             || '    RAISE EXCEPTION ''Only platform admins can create organizations here'' USING ERRCODE = ''42501'';' || E'\n'
             || '  END IF;';
    END IF;
    v_def := pg_get_functiondef(r.oid);
    SELECT prosrc INTO v_src FROM pg_proc WHERE oid = r.oid;
    v_pos := regexp_instr(v_src, '(^|\n)[ \t]*BEGIN[ \t]*(--[^\n]*)?\r?\n', 1, 1, 1, 'i');
    IF v_pos = 0 THEN
      RAISE EXCEPTION '%: BEGIN line not found, fix by hand', r.proname;
    END IF;
    v_def := overlay(v_def PLACING
               left(v_src, v_pos - 1)
               || '  -- security review 2026-09-27' || E'\n'
               || v_line || E'\n'
               || substr(v_src, v_pos)
             FROM position(v_src IN v_def) FOR length(v_src));
    EXECUTE v_def;
  END LOOP;
END
$fix3$;

