-- Warning when a price is changed for items already sent to another shop (user's choice, 27 Nov
-- 2026). A price changed in the sending shop AFTER a Stock Transfer is not copied to the other
-- shop (ADEEBA AREEBA STUDIO raised 36 prices 7 hours after ST/0013; ADEEBAAREEBA kept the old
-- ones). The app now calls this after saving prices and shows a warning listing the items.
--
-- get_transferred_price_gaps(p_org_id, p_variant_ids): of the given items of this shop, those
-- received by another shop through an accepted transfer, where that shop still has stock and
-- sells at a different price. Read-only. Checks the caller belongs to p_org_id and only looks
-- at transfers sent FROM that shop. At most 1000 ids per call.
-- Safe to re-run. UNDO: DROP FUNCTION public.get_transferred_price_gaps(uuid, uuid[]);
--   (the app then shows no warning).

CREATE OR REPLACE FUNCTION public.get_transferred_price_gaps(p_org_id uuid, p_variant_ids uuid[])
RETURNS TABLE(
  variant_id uuid,
  barcode text,
  product_name text,
  size text,
  sender_sale_price numeric,
  to_shop text,
  receiver_sale_price numeric,
  receiver_stock numeric,
  transfer_number text,
  accepted_at timestamptz
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_variant_ids IS NULL OR cardinality(p_variant_ids) = 0 THEN
    RETURN;
  END IF;
  IF cardinality(p_variant_ids) > 1000 THEN
    RAISE EXCEPTION 'At most 1000 items per call' USING ERRCODE = '22023';
  END IF;

  RETURN QUERY
  SELECT DISTINCT ON (dv.id)
         sv.id, sv.barcode, COALESCE(sti.product_name, ''), sv.size,
         sv.sale_price, tor.name, dv.sale_price, dv.stock_qty,
         st.transfer_number, st.accepted_at
  FROM public.stock_transfer_items sti
  JOIN public.stock_transfers st
    ON st.id = sti.transfer_id
   AND st.status = 'accepted'
   AND st.from_organization_id = p_org_id
  JOIN public.product_variants sv
    ON sv.id = sti.from_variant_id
   AND sv.organization_id = p_org_id
   AND sv.deleted_at IS NULL
  JOIN public.product_variants dv
    ON dv.id = sti.to_variant_id
   AND dv.organization_id = st.to_organization_id
   AND dv.deleted_at IS NULL
  JOIN public.organizations tor ON tor.id = st.to_organization_id
  WHERE sti.from_variant_id = ANY (p_variant_ids)
    AND COALESCE(sv.sale_price, 0) > 0
    AND COALESCE(dv.stock_qty, 0) > 0
    AND dv.sale_price IS DISTINCT FROM sv.sale_price
  ORDER BY dv.id, st.accepted_at DESC;
END;
$$;

COMMENT ON FUNCTION public.get_transferred_price_gaps(uuid, uuid[]) IS
  'Items of this shop sent to another shop (accepted transfer) that the other shop still stocks at a different sale price. Read-only; used for a warning after a price change.';

REVOKE ALL ON FUNCTION public.get_transferred_price_gaps(uuid, uuid[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.get_transferred_price_gaps(uuid, uuid[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.get_transferred_price_gaps(uuid, uuid[]) TO authenticated, service_role;

-- Check (read-only): one row, both true.
-- SELECT has_function_privilege('authenticated', 'public.get_transferred_price_gaps(uuid, uuid[])', 'EXECUTE') AS signed_in_users_can_run,
--        NOT has_function_privilege('anon', 'public.get_transferred_price_gaps(uuid, uuid[])', 'EXECUTE') AS closed_to_public;
