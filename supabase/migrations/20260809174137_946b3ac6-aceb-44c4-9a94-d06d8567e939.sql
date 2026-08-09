REVOKE EXECUTE ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, integer) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, integer) TO service_role;