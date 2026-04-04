-- Drop the duplicate version (p_search before p_page)
DROP FUNCTION IF EXISTS public.get_product_catalog_page(
  uuid, text, text, text, uuid, text, numeric, numeric, integer, integer
);