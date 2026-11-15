-- Plan Phase 4, R6: save an edited quotation, sale order, purchase order or delivery challan
-- (header + all its lines) in ONE transaction.
--
-- The four edit screens saved in separate requests: update the header (totals), delete the old
-- lines, insert the new ones. The browser now checks each step and puts the old lines back when
-- the insert fails, but a dropped connection between the requests could still leave the new
-- totals on the old lines (or, for a challan, the new lines under the old totals).
--
-- save_document_with_lines(kind, org, document_id, header, lines):
--   * kind 'quotation'        -> quotations        + quotation_items        (quotation_id)
--          'sale_order'       -> sale_orders       + sale_order_items       (order_id)
--          'purchase_order'   -> purchase_orders   + purchase_order_items   (order_id)
--          'delivery_challan' -> delivery_challans + delivery_challan_items (challan_id)
--   * the document must belong to the shop (else "Document not found", nothing changes);
--   * updates only header keys that are real columns (never id / organization_id);
--   * deletes the document's lines and inserts the new ones (only keys that are real columns;
--     the parent id on every line is set here). An empty list leaves the document with no lines,
--     as the screens did;
--   * all of it, or nothing (a line refused by a trigger rolls the header back too).
-- SECURITY INVOKER: same RLS and triggers (stock, godown) as the direct writes it replaces.
-- The app falls back to the old steps while this function is missing.
-- UNDO: DROP FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb);

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

  IF v_set_list IS NOT NULL THEN
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

  RETURN jsonb_build_object('success', true, 'lines_deleted', v_deleted, 'lines_inserted', v_inserted);
END;
$$;

REVOKE ALL ON FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_document_with_lines(text, uuid, uuid, jsonb, jsonb) IS
  'Saves an edited quotation / sale order / purchase order / delivery challan (header + lines) in one transaction (Plan Phase 4, R6).';
