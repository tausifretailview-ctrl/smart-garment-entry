-- Plan Phase 2, A3: permanent delete (Recycle Bin / Sales dashboard) in ONE transaction.
--
-- useSoftDelete.hardDelete removed the lines and then the header in separate requests for
-- sales, sale returns, purchase returns, sale orders, quotations, vouchers and products. If the
-- header delete then failed (permission, a row still pointing at it, a dropped connection), the
-- document stayed behind without its lines. Purchase bills already use hard_delete_purchase_bill.
--
-- hard_delete_document(entity, id) runs the SAME deletes in one transaction: every line and the
-- header go, or nothing does.
--   sales            -> salesman_commissions (when the table exists), sale_items, sales
--   sale_returns     -> sale_return_items, sale_returns
--   purchase_returns -> purchase_return_items, purchase_returns
--   sale_orders      -> sale_order_items, sale_orders
--   quotations       -> quotation_items, quotations
--   voucher_entries  -> voucher_items, voucher_entries
--   products         -> product_variants, products
-- SECURITY INVOKER: the same RLS policies and delete triggers apply as for the browser deletes
-- it replaces. Admin only for sales, returns and products, as the screen already requires.
-- The product "used in transactions" check stays in the app before this is called.
-- UNDO: DROP FUNCTION public.hard_delete_document(text, uuid);

CREATE OR REPLACE FUNCTION public.hard_delete_document(p_entity text, p_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_org uuid;
  v_lines integer := 0;
  v_header integer;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_entity IS NULL OR p_entity NOT IN (
    'sales', 'sale_returns', 'purchase_returns', 'sale_orders', 'quotations', 'voucher_entries', 'products'
  ) THEN
    RAISE EXCEPTION 'Permanent delete is not supported for %', coalesce(p_entity, '(none)') USING ERRCODE = '22023';
  END IF;
  IF p_id IS NULL THEN
    RAISE EXCEPTION 'Record id is required' USING ERRCODE = '22023';
  END IF;

  EXECUTE format('SELECT organization_id FROM public.%I WHERE id = $1', p_entity) INTO v_org USING p_id;
  IF v_org IS NULL THEN
    RAISE EXCEPTION 'Record not found, or you may not have permission to permanently delete it.' USING ERRCODE = 'P0002';
  END IF;
  IF NOT (v_org IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_entity IN ('sales', 'sale_returns', 'purchase_returns', 'products')
     AND NOT public.has_org_role(auth.uid(), v_org, 'admin'::app_role) THEN
    RAISE EXCEPTION 'Only admin can permanently delete this record.' USING ERRCODE = '42501';
  END IF;

  PERFORM set_config('statement_timeout', '120s', true);

  IF p_entity = 'sales' THEN
    IF to_regclass('public.salesman_commissions') IS NOT NULL THEN
      EXECUTE 'DELETE FROM public.salesman_commissions WHERE sale_id = $1' USING p_id;
    END IF;
    DELETE FROM public.sale_items WHERE sale_id = p_id;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  ELSIF p_entity = 'sale_returns' THEN
    DELETE FROM public.sale_return_items WHERE return_id = p_id;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  ELSIF p_entity = 'purchase_returns' THEN
    DELETE FROM public.purchase_return_items WHERE return_id = p_id;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  ELSIF p_entity = 'sale_orders' THEN
    DELETE FROM public.sale_order_items WHERE order_id = p_id;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  ELSIF p_entity = 'quotations' THEN
    DELETE FROM public.quotation_items WHERE quotation_id = p_id;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  ELSIF p_entity = 'voucher_entries' THEN
    DELETE FROM public.voucher_items WHERE voucher_id = p_id;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  ELSIF p_entity = 'products' THEN
    DELETE FROM public.product_variants WHERE product_id = p_id AND organization_id = v_org;
    GET DIAGNOSTICS v_lines = ROW_COUNT;
  END IF;

  EXECUTE format('DELETE FROM public.%I WHERE id = $1 AND organization_id = $2', p_entity)
    USING p_id, v_org;
  GET DIAGNOSTICS v_header = ROW_COUNT;
  IF v_header = 0 THEN
    -- Undo the line deletes too: the document must not be left without its lines.
    RAISE EXCEPTION 'Delete was not applied. You may not have permission to permanently delete this record.'
      USING ERRCODE = '42501';
  END IF;

  RETURN jsonb_build_object('success', true, 'entity', p_entity, 'id', p_id, 'lines_deleted', v_lines);
END;
$$;

REVOKE ALL ON FUNCTION public.hard_delete_document(text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.hard_delete_document(text, uuid) TO authenticated;

COMMENT ON FUNCTION public.hard_delete_document(text, uuid) IS
  'Permanent delete of a document with its lines in one transaction (Plan Phase 2, A3).';
