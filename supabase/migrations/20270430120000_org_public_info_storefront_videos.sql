-- get_org_public_info: also return the store's home-page videos and product slideshow switch.
--
-- The function returns named settings only (20270415120000). The "Watch & shop" videos saved in
-- Website -> Theme (settings.storefront_videos) were not on that list, so the public store never
-- received them and the video row stayed hidden. This adds:
--   storefront_videos    home-page video clips (Street theme)
--   storefront_showcase  product slideshow on/off (false hides it; unset = shown)
-- Everything else is unchanged: same signature, same other keys, same grants.
-- Safe to run more than once.
-- UNDO: re-run supabase/migrations/20270415120000_org_public_info_named_fields.sql

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
    'settings', jsonb_strip_nulls(jsonb_build_object(
      'address', o.settings -> 'address',
      'mobile_number', o.settings -> 'mobile_number',
      'storefront_theme', o.settings -> 'storefront_theme',
      'storefront_banners', o.settings -> 'storefront_banners',
      'storefront_sections', o.settings -> 'storefront_sections',
      'storefront_product_sections', o.settings -> 'storefront_product_sections',
      'storefront_videos', o.settings -> 'storefront_videos',
      'storefront_showcase', o.settings -> 'storefront_showcase'
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
