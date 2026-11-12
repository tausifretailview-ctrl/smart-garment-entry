-- Plan Phase 2, returns: save a sale return or a purchase return (number, header and lines)
-- in ONE transaction.
--
-- Sale Return Entry, the floating Sale Return window and Purchase Return Entry saved in steps
-- from the browser: take the next SR/ PR number, insert the header, then insert the lines. A
-- failed or dropped line insert left a return without lines (Purchase Return Entry did not even
-- remove the header), which the invariants review found in production. The numbers were
-- MAX + 1 with no lock, so two users saving at once could get the same number.
--
-- save_return_with_items_atomic(kind, org, header, items):
--   * kind 'sale_return'     -> sale_returns + sale_return_items, number generate_sale_return_number
--     kind 'purchase_return' -> purchase_returns + purchase_return_items, generate_purchase_return_number
--   * holds a per-shop lock for that series until commit, then takes the number with the SAME
--     function the screens called, so the next return waits a moment and gets the next number;
--   * inserts only the keys that are real columns (like save_sale_with_items_atomic), so a
--     database without purchase_returns.is_dc simply drops it instead of failing (the screen's
--     old "missing is_dc column" retry);
--   * organization_id on the header and return_id on every line are set here;
--   * the whole return is saved, or nothing is (a line refused by a stock trigger, e.g. "No Stock
--     available For Return", leaves no header behind).
-- Journals, credit notes and godown moves stay in the screens, unchanged.
-- SECURITY INVOKER: same RLS and triggers as the direct inserts it replaces.
-- UNDO: DROP FUNCTION public.save_return_with_items_atomic(text, uuid, jsonb, jsonb);

CREATE OR REPLACE FUNCTION public.save_return_with_items_atomic(
  p_kind text,
  p_organization_id uuid,
  p_header jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_header_table regclass;
  v_items_table regclass;
  v_number text;
  v_header jsonb;
  v_items jsonb;
  v_header_cols text;
  v_item_cols text;
  v_row jsonb;
  v_return_id uuid;
  v_count integer;
  v_dropped_header text[];
  v_dropped_items text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_kind = 'sale_return' THEN
    v_header_table := 'public.sale_returns'::regclass;
    v_items_table := 'public.sale_return_items'::regclass;
  ELSIF p_kind = 'purchase_return' THEN
    v_header_table := 'public.purchase_returns'::regclass;
    v_items_table := 'public.purchase_return_items'::regclass;
  ELSE
    RAISE EXCEPTION 'kind must be sale_return or purchase_return' USING ERRCODE = '22023';
  END IF;
  IF p_header IS NULL OR jsonb_typeof(p_header) <> 'object' THEN
    RAISE EXCEPTION 'header must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A return needs at least one line' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 1000 THEN
    RAISE EXCEPTION 'Too many lines in one return' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION 'Every line must be an object' USING ERRCODE = '22023';
  END IF;

  PERFORM set_config('statement_timeout', '120s', true);

  -- One return number at a time per shop and series, held until this return is committed.
  PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text || ':' || p_kind || ':number'));
  IF p_kind = 'sale_return' THEN
    v_number := public.generate_sale_return_number(p_organization_id);
  ELSE
    v_number := public.generate_purchase_return_number(p_organization_id);
  END IF;
  IF v_number IS NULL OR btrim(v_number) = '' THEN
    RAISE EXCEPTION 'Could not get the next return number' USING ERRCODE = 'P0001';
  END IF;

  v_header := (p_header - 'id')
    || jsonb_build_object('organization_id', p_organization_id, 'return_number', v_number);

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_header_cols
  FROM pg_attribute a
  WHERE a.attrelid = v_header_table
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.attname <> 'id'
    AND a.attname IN (SELECT jsonb_object_keys(v_header));

  SELECT coalesce(array_agg(k ORDER BY k), '{}')
  INTO v_dropped_header
  FROM jsonb_object_keys(v_header) k
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = v_header_table AND a.attname = k
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attname <> 'id'
  );

  EXECUTE format(
    'INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_record(NULL::%1$s, $1) RETURNING to_jsonb(%1$s.*)',
    v_header_table, v_header_cols
  ) USING v_header INTO v_row;

  v_return_id := (v_row->>'id')::uuid;

  SELECT jsonb_agg((e - 'id' - 'return_id') || jsonb_build_object('return_id', v_return_id) ORDER BY o)
  INTO v_items
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, o);

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_item_cols
  FROM pg_attribute a
  WHERE a.attrelid = v_items_table
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.attname <> 'id'
    AND a.attname IN (SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(v_items) e);

  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}')
  INTO v_dropped_items
  FROM jsonb_array_elements(v_items) e, jsonb_object_keys(e) k
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = v_items_table AND a.attname = k
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attname <> 'id'
  );

  EXECUTE format(
    'INSERT INTO %1$s (%2$s) SELECT %2$s FROM jsonb_populate_recordset(NULL::%1$s, $1)',
    v_items_table, v_item_cols
  ) USING v_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'return', v_row,
    'return_number', v_number,
    'items_inserted', v_count,
    'dropped_header_keys', to_jsonb(v_dropped_header),
    'dropped_item_keys', to_jsonb(v_dropped_items)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_return_with_items_atomic(text, uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_return_with_items_atomic(text, uuid, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_return_with_items_atomic(text, uuid, jsonb, jsonb) IS
  'Saves a sale or purchase return (number, header, lines) in one transaction (Plan Phase 2, returns).';
