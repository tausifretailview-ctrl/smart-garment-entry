-- Plan Phase 2, step 1: save a bill header and its lines in one transaction.
--
-- useSaveSale inserted the sales row, then the sale_items in separate requests (5 lines
-- at a time). A dropped connection or a failed line between them left a bill with no
-- lines (or some lines), which the app then tried to clean up from the browser
-- (saleEmptyHeaderRollback). This function inserts both in one transaction: the whole
-- bill is saved, or nothing is.
--
-- It is a thin wrapper, not a rewrite of the save:
--  * SECURITY INVOKER: runs as the signed-in user, so the same RLS policies, grants and
--    triggers (stock, totals, DC bill) apply exactly as for the direct inserts it replaces.
--  * Inserts only the keys the client sends that are real columns, so omitted columns keep
--    their defaults (as a PostgREST insert does). Keys that are not columns are dropped and
--    reported back (e.g. sale_items.salesman before its migration), so the app can warn the
--    same way insertSaleItemsResilient did.
--  * organization_id on the header and sale_id on every line are set here, never trusted
--    from the client.
-- Bill numbering, credit, payment state, points and messages stay in the app for now.
-- Used only when Settings → POS "One-step bill save" is on for the shop.

CREATE OR REPLACE FUNCTION public.save_sale_with_items_atomic(
  p_organization_id uuid,
  p_sale jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_sale jsonb;
  v_items jsonb;
  v_sale_cols text;
  v_item_cols text;
  v_sale_row jsonb;
  v_sale_id uuid;
  v_count integer;
  v_dropped_sale text[];
  v_dropped_items text[];
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_sale IS NULL OR jsonb_typeof(p_sale) <> 'object' THEN
    RAISE EXCEPTION 'p_sale must be an object' USING ERRCODE = '22023';
  END IF;
  IF p_items IS NULL OR jsonb_typeof(p_items) <> 'array' OR jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'A bill needs at least one line' USING ERRCODE = '22023';
  END IF;
  IF jsonb_array_length(p_items) > 1000 THEN
    RAISE EXCEPTION 'Too many lines in one bill' USING ERRCODE = '22023';
  END IF;
  IF EXISTS (SELECT 1 FROM jsonb_array_elements(p_items) e WHERE jsonb_typeof(e) <> 'object') THEN
    RAISE EXCEPTION 'Every line must be an object' USING ERRCODE = '22023';
  END IF;

  -- Each line fires stock triggers; same allowance as the purchase one-step save.
  PERFORM set_config('statement_timeout', '120s', true);

  v_sale := (p_sale - 'id') || jsonb_build_object('organization_id', p_organization_id);

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_sale_cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.sales'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.attname <> 'id'
    AND a.attname IN (SELECT jsonb_object_keys(v_sale));

  SELECT coalesce(array_agg(k ORDER BY k), '{}')
  INTO v_dropped_sale
  FROM jsonb_object_keys(v_sale) k
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.sales'::regclass AND a.attname = k
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attname <> 'id'
  );

  EXECUTE format(
    'INSERT INTO public.sales (%1$s) SELECT %1$s FROM jsonb_populate_record(NULL::public.sales, $1) RETURNING to_jsonb(sales.*)',
    v_sale_cols
  ) USING v_sale INTO v_sale_row;

  v_sale_id := (v_sale_row->>'id')::uuid;

  SELECT jsonb_agg((e - 'id' - 'sale_id') || jsonb_build_object('sale_id', v_sale_id) ORDER BY o)
  INTO v_items
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(e, o);

  SELECT string_agg(quote_ident(a.attname), ', ' ORDER BY a.attnum)
  INTO v_item_cols
  FROM pg_attribute a
  WHERE a.attrelid = 'public.sale_items'::regclass
    AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = ''
    AND a.attname <> 'id'
    AND a.attname IN (SELECT DISTINCT jsonb_object_keys(e) FROM jsonb_array_elements(v_items) e);

  SELECT coalesce(array_agg(DISTINCT k ORDER BY k), '{}')
  INTO v_dropped_items
  FROM jsonb_array_elements(v_items) e, jsonb_object_keys(e) k
  WHERE NOT EXISTS (
    SELECT 1 FROM pg_attribute a
    WHERE a.attrelid = 'public.sale_items'::regclass AND a.attname = k
      AND a.attnum > 0 AND NOT a.attisdropped AND a.attgenerated = '' AND a.attname <> 'id'
  );

  -- Lines go in the order the client sent them (stock triggers and line order follow it).
  EXECUTE format(
    'INSERT INTO public.sale_items (%1$s) SELECT %1$s FROM jsonb_populate_recordset(NULL::public.sale_items, $1)',
    v_item_cols
  ) USING v_items;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  RETURN jsonb_build_object(
    'sale', v_sale_row,
    'items_inserted', v_count,
    'dropped_sale_keys', to_jsonb(v_dropped_sale),
    'dropped_item_keys', to_jsonb(v_dropped_items)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_sale_with_items_atomic(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sale_with_items_atomic(uuid, jsonb, jsonb) TO authenticated;
