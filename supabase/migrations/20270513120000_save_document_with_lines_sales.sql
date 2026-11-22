-- Review item B1, B2, B4 (22 Nov 2026): save an EDITED sale bill (POS bill, Sale Bill, a held bill
-- being completed) or an edited sale return in ONE transaction.
--
-- These edits ran as separate requests from the browser: delete the old lines, insert the new
-- ones (sale lines 5 at a time), then update the header. A dropped connection or a timeout in
-- the middle left the bill with some lines missing, or doubled, under the old totals, and stock
-- wrong. New bills already save in one step (save_sale_with_items_atomic); edits did not.
--
-- save_document_with_lines (20270426120000) already does exactly this for quotations, sale
-- orders, purchase orders and delivery challans. This script adds two kinds to it:
--   * 'sale'        -> sales        + sale_items        (sale_id)
--   * 'sale_return' -> sale_returns + sale_return_items (return_id)
-- For these two the order stays what the screens used: delete lines, insert lines, then update
-- the header (the other four kinds are unchanged: header first).
-- The result now also carries the saved header row ("header"), so the screen does not need a
-- second request. Everything else is as before: the document must belong to the shop, only real
-- columns are written (never id / organization_id), all of it or nothing.
-- SECURITY INVOKER: the same RLS and the same triggers (stock, ledger, guards) as the direct
-- writes it replaces. The app falls back to the old steps while this script has not been run.
-- UNDO: run 20270426120000_save_document_with_lines.sql again.

CREATE OR REPLACE FUNCTION public.save_document_with_lines(
  p_kind text,
  p_organization_id uuid,
  p_document_id uuid,
  p_header jsonb,
  p_lines jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_header_table regclass;
  v_lines_table regclass;
  v_parent_col text;
  v_header jsonb;
  v_lines jsonb;
  v_set_list text;
  v_line_cols text;
  v_found boolean;
  v_deleted integer := 0;
  v_inserted integer := 0;
  -- Sales and sale returns keep the order the screens used: lines first, then the header.
  v_header_first boolean := true;
  v_saved_header jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF p_kind = 'quotation' THEN
    v_header_table := 'public.quotations'::regclass;
    v_lines_table := 'public.quotation_items'::regclass;
    v_parent_col := 'quotation_id';
  ELSIF p_kind = 'sale_order' THEN
    v_header_table := 'public.sale_orders'::regclass;
    v_lines_table := 'public.sale_order_items'::regclass;
    v_parent_col := 'order_id';
  ELSIF p_kind = 'purchase_order' THEN
    v_header_table := 'public.purchase_orders'::regclass;
    v_lines_table := 'public.purchase_order_items'::regclass;
    v_parent_col := 'order_id';
  ELSIF p_kind = 'delivery_challan' THEN
    v_header_table := 'public.delivery_challans'::regclass;
    v_lines_table := 'public.delivery_challan_items'::regclass;
    v_parent_col := 'challan_id';
  ELSIF p_kind = 'sale' THEN
    v_header_table := 'public.sales'::regclass;
    v_lines_table := 'public.sale_items'::regclass;
    v_parent_col := 'sale_id';
    v_header_first := false;
  ELSIF p_kind = 'sale_return' THEN
    v_header_table := 'public.sale_returns'::regclass;
    v_lines_table := 'public.sale_return_items'::regclass;
    v_parent_col := 'return_id';
    v_header_first := false;
  ELSE
    RAISE EXCEPTION 'Unknown document kind %', p_kind USING ERRCODE = '22023';
  END IF;

  IF p_document_id IS NULL THEN
    RAISE EXCEPTION 'document id is required' USING ERRCODE = '22023';
  END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    RAISE EXCEPTION 'header must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_lines IS NULL OR jsonb_typeof(p_lines) <> 'array' THEN
    RAISE EXCEPTION 'lines must be an array' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_lines) > 1000 THEN
    RAISE EXCEPTION 'Too many lines in one document' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_lines) e WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION 'Every line must be an object' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('statement_timeout', '120s', true);

  -- The document must exist in this shop; lock it until commit so two saves do not interleave.
  EXECUTE format('SELECT true FROM %s WHERE id = $1 AND organization_id = $2 FOR UPDATE', v_header_table)
    USING p_document_id, p_organization_id INTO v_found;
  IF v_found IS NOT TRUE THEN
    RAISE EXCEPTION 'Document not found' USING ERRCODE = 'P0002';
  END IF;

  v_header := p_header - 'id' - 'organization_id';
  SELECT string_agg(format('%1$I = r.%1$I', a.attname), ', ' ORDER BY a.attnum)
  INTO v_set_list
  FROM pg_attribute a
  WHERE a.attrelid = v_header_table
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.attname NOT IN ('id', 'organization_id')
    AND a.attname IN (SELECT jsonb_object_keys(v_header));

  IF v_set_list IS NOT NULL AND v_header_first THEN
    EXECUTE format(
      'UPDATE %1$s t SET %2$s FROM jsonb_populate_record(NULL::%1$s, $1) r WHERE t.id = $2 AND t.organization_id = $3',
      v_header_table, v_set_list
    ) USING v_header, p_document_id, p_organization_id;
  END IF;

  EXECUTE format('DELETE FROM %s WHERE %I = $1', v_lines_table, v_parent_col) USING p_document_id;
  GET DIAGNOSTICS v_deleted = ROW_COUNT;

  IF jsonb_array_length(p_lines) > 0 THEN
    SELECT jsonb_agg((e - 'id' - v_parent_col) || jsonb_build_object(v_parent_col, p_document_id) ORDER BY o)
    INTO v_lines
    FROM jsonb_array_elements(p_lines) WITH ORDINALITY AS t(e, o);

    SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
    INTO v_line_cols
    FROM pg_attribute a
    WHERE a.attrelid = v_lines_table
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
      AND a.attname <> 'id'
      AND a.attname IN (SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(v_lines) e);

    EXECUTE format(
      'INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_recordset(NULL::%1$s, $1)',
      v_lines_table, v_line_cols
    ) USING v_lines;
    GET DIAGNOSTICS v_inserted = ROW_COUNT;
  END IF;

  IF v_set_list IS NOT NULL AND NOT v_header_first THEN
    EXECUTE format(
      'UPDATE %1$s t SET %2$s FROM jsonb_populate_record(NULL::%1$s, $1) r WHERE t.id = $2 AND t.organization_id = $3',
      v_header_table, v_set_list
    ) USING v_header, p_document_id, p_organization_id;
  END IF;

  -- The header as saved (after every trigger), so the screen needs no second request.
  EXECUTE format('SELECT to_jsonb(t) FROM %s t WHERE t.id = $1 AND t.organization_id = $2', v_header_table)
    USING p_document_id, p_organization_id INTO v_saved_header;

  RETURN jsonb_build_object(
    'success', true,
    'lines_deleted', v_deleted,
    'lines_inserted', v_inserted,
    'header', v_saved_header
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb) IS
  'Saves an edited quotation / sale order / purchase order / delivery challan / sale bill / sale return (header + lines) in one transaction.';
