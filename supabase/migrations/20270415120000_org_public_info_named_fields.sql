-- get_org_public_info: return named fields only.
--
-- This function is callable without signing in (anon) by anyone who knows a shop's web
-- address. It returned the shop's whole organizations.settings and the whole
-- settings.bill_barcode_settings: every POS, invoice, barcode, points, WhatsApp-template
-- and e-invoice option, plus the invoice stamp image as embedded base64 on every login
-- page load. The login page and the public store read only the fields below.
--
-- Same signature, same top-level keys (id, name, slug, settings, business_name,
-- bill_barcode_settings), so existing callers keep working. Keys a shop has not set are
-- left out rather than sent as null.
--
-- Readers (keep in step; test/orgPublicInfoFields.test.ts checks this list):
--   src/pages/OrgAuth.tsx                 business_name, bill.logo_url / login_display_name / brand_color
--   src/storefront/storefrontTheme.ts     settings.address / mobile_number, bill.logo_url / login_display_name /
--                                         upi_id / upi_id_2 / active_upi_id / upi_business_name / instagram_link
--   src/storefront/storefrontClient.ts    id, settings.storefront_theme / storefront_banners /
--                                         storefront_sections / storefront_product_sections

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
      'storefront_product_sections', o.settings -> 'storefront_product_sections'
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
