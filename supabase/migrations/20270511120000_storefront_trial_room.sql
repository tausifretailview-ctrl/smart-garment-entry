-- AI Trial Room on the website ("Try it on" on a product page).
--
-- 1. storefront_tryons: one row per try-on run by the storefront-try-on edge function. Used for
--    the limits (per shop per day, per visitor per hour) and to show the shop its usage. The
--    shopper's photo and the AI preview are NOT stored: only shop, product, a hashed visitor id
--    and ok / error. Only the edge function (service role) writes here.
-- 2. get_org_public_info: also returns the shop's trial-room switch
--    (organizations.settings.storefront_trial_room) and lists 'trial_room' in store_features, so
--    the website shows the button only once this file has run AND the shop switched it on
--    (Website -> Theme -> AI Trial Room; off by default because each try-on costs an AI call).
--
-- Includes everything from 20270506120000 (notice strips, currency, reserve & try). Run this
-- one after that file; if an older get_org_public_info file is run later, run this one again.
-- Same signature, same grants. Safe to run more than once.
-- UNDO: re-run supabase/migrations/20270506120000_org_public_info_store_strips.sql
--       (the storefront_tryons table can stay; nothing reads it once the button is gone).

CREATE TABLE IF NOT EXISTS public.storefront_tryons (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  product_id uuid,
  visitor_hash text NOT NULL,
  ok boolean NOT NULL DEFAULT false,
  model text,
  error text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_storefront_tryons_org_created
  ON public.storefront_tryons (organization_id, created_at DESC);

ALTER TABLE public.storefront_tryons ENABLE ROW LEVEL SECURITY;

-- Shop staff may read their own shop's usage. No insert / update / delete policy: the public
-- website and logged-in users cannot write; the edge function uses the service role.
DROP POLICY IF EXISTS "storefront_tryons_org_members_select" ON public.storefront_tryons;
CREATE POLICY "storefront_tryons_org_members_select"
  ON public.storefront_tryons
  FOR SELECT
  TO authenticated
  USING (user_belongs_to_org((SELECT auth.uid()), organization_id));

REVOKE ALL ON public.storefront_tryons FROM anon;
GRANT SELECT ON public.storefront_tryons TO authenticated;

CREATE OR REPLACE FUNCTION public.get_org_public_info(p_slug text)
RETURNS json
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT json_build_object(
    'id', o.id,
    'name', o.name,
    'slug', o.slug,
    -- What this database can do for the store, so the website only shows buttons that work.
    'store_features', json_build_array('reserve_try', 'restock_alert', 'trial_room'),
    'settings', jsonb_strip_nulls(jsonb_build_object(
      'address', o.settings -> 'address',
      'mobile_number', o.settings -> 'mobile_number',
      'storefront_theme', o.settings -> 'storefront_theme',
      'storefront_banners', o.settings -> 'storefront_banners',
      'storefront_sections', o.settings -> 'storefront_sections',
      'storefront_product_sections', o.settings -> 'storefront_product_sections',
      'storefront_videos', o.settings -> 'storefront_videos',
      'storefront_showcase', o.settings -> 'storefront_showcase',
      'storefront_size_helper', o.settings -> 'storefront_size_helper',
      'storefront_requests', o.settings -> 'storefront_requests',
      'storefront_strips', o.settings -> 'storefront_strips',
      'storefront_currency', o.settings -> 'storefront_currency',
      'storefront_trial_room', o.settings -> 'storefront_trial_room'
    )),
    'business_name', s.business_name,
    'bill_barcode_settings', jsonb_strip_nulls(jsonb_build_object(
      'logo_url', s.bill_barcode_settings -> 'logo_url',
      'login_display_name', s.bill_barcode_settings -> 'login_display_name',
      'brand_color', s.bill_barcode_settings -> 'brand_color',
      'upi_id', s.bill_barcode_settings -> 'upi_id',
      'upi_id_2', s.bill_barcode_settings -> 'upi_id_2',
      'active_upi_id', s.bill_barcode_settings -> 'active_upi_id',
      'upi_business_name', s.bill_barcode_settings -> 'upi_business_name',
      'instagram_link', s.bill_barcode_settings -> 'instagram_link'
    ))
  )
  FROM public.resolve_organization_by_public_slug(p_slug) r
  JOIN public.organizations o ON o.id = r.id
  LEFT JOIN public.settings s ON s.organization_id = o.id
  LIMIT 1;
$$;

REVOKE ALL ON FUNCTION public.get_org_public_info(text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO anon;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_org_public_info(text) TO service_role;

NOTIFY pgrst, 'reload schema';
