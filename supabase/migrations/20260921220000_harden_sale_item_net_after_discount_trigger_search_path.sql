-- Hardens the net_after_discount guard trigger with an explicit search_path.
-- Low practical risk (the one table reference is already schema-qualified,
-- and the function is SECURITY INVOKER, not DEFINER) — defense in depth.

ALTER FUNCTION public.trg_fix_sale_item_net_after_discount()
  SET search_path = public, pg_catalog;
