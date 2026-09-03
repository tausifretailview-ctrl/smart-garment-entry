REVOKE EXECUTE ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM anon;
REVOKE EXECUTE ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.delete_child_rows_for_org(text, text, text, uuid) TO service_role;