-- Public storefront data is served exclusively through SECURITY DEFINER RPCs
-- (get_public_storefront / get_org_public_info). The anon role has no table-level
-- privileges on these tables, so these anon SELECT policies are inert; removing
-- them closes the door if privileges are ever granted by mistake.
DROP POLICY IF EXISTS "Anon can view active menus of published stores" ON public.website_menus;
DROP POLICY IF EXISTS "Anon can view active products of published stores" ON public.website_products;

REVOKE ALL ON public.website_menus FROM anon;
REVOKE ALL ON public.website_products FROM anon;