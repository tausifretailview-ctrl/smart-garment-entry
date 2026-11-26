-- Sale Return / Purchase Return: keep a return number the user typed.
--
-- Settings -> Purchase -> "Allow typing the return number" lets a shop type its own SR/ PR
-- number (the next series number is shown first). save_return_with_items_atomic always took
-- the next series number, so a typed number was replaced on save.
--
-- Same function, same signature, one change: when the header has manual_return_number (not a
-- column, never inserted), that number is used instead of the series, after checking under the
-- per-shop lock that no live return of the shop already has it ("already used" -> 23505).
-- Without the key it behaves exactly as before. The unique index
-- (organization_id, return_number) WHERE deleted_at IS NULL still guards every insert.
-- A typed number in the series' own form (e.g. PR/26-27/90) moves the next series number on
-- to 91, as the series is MAX + 1.
--
-- SECURITY INVOKER as before (same RLS and triggers as direct inserts).
-- UNDO: re-run 20270421120000_save_return_with_items_atomic.sql.

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
  v_manual text;
  v_taken boolean;
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
  -- A number the user typed (Settings -> Purchase -> "Allow typing the return number"). It is
  -- checked under the same lock, so it cannot clash with a return saved at the same moment.
  v_manual := NULLIF(btrim(COALESCE(p_header->>'manual_return_number', '')), '');
  IF v_manual IS NOT NULL THEN
    IF length(v_manual) > 40 THEN
      RAISE EXCEPTION 'Return number can be at most 40 characters' USING ERRCODE = '22023';
    END IF;
    IF v_manual ~ '[[:cntrl:]]' THEN
      RAISE EXCEPTION 'Return number has a character that cannot be saved' USING ERRCODE = '22023';
    END IF;
    EXECUTE format(
      'SELECT EXISTS (SELECT 1 FROM %s WHERE organization_id = $1 AND return_number = $2 AND deleted_at IS NULL)',
      v_header_table
    ) USING p_organization_id, v_manual INTO v_taken;
    IF v_taken THEN
      RAISE EXCEPTION 'Return number % is already used. Type another number, or clear the box to use the next number.', v_manual
        USING ERRCODE = '23505';
    END IF;
    v_number := v_manual;
  ELSIF p_kind = 'sale_return' THEN
    v_number := public.generate_sale_return_number(p_organization_id);
  ELSE
    v_number := public.generate_purchase_return_number(p_organization_id);
  END IF;
  IF v_number IS NULL OR btrim(v_number) = '' THEN
    RAISE EXCEPTION 'Could not get the next return number' USING ERRCODE = 'P0001';
  END IF;

  v_header := (p_header - 'id' - 'manual_return_number')
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
  'Saves a sale or purchase return (number, header, lines) in one transaction (Plan Phase 2, returns). header.manual_return_number, when given, is used as the number.';
