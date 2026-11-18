-- get_org_public_info: also return the Street store's notice strips and currency picker.
--
-- The function returns named settings only (20270415120000). This adds:
--   storefront_strips    top terms strip, running strip under the banner, footer strip
--   storefront_currency  bottom-left currency picker on/off and the shop's rates
-- Before this runs the store shows its general lines and the starting currency rates; what the
-- shop saves in Website -> Theme -> Notices & currency reaches the store after it.
-- Includes everything from 20270505120000 (reserve & try, store_features). Run this one after
-- that file; if an older get_org_public_info file is run later, run this one again.
-- Same signature, same grants. Safe to run more than once.
-- UNDO: re-run supabase/migrations/20270505120000_website_reserve_and_restock.sql

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
    'store_features', json_build_array('reserve_try', 'restock_alert'),
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
      'storefront_currency', o.settings -> 'storefront_currency'
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
