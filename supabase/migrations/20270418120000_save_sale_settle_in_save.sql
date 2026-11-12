-- Plan Phase 2, step 3: settle paid_amount / payment_status in the same transaction as the bill.
--
-- After every save the app called compute_sale_settlement, read the bill back and wrote the
-- result: 2-3 more requests per bill, and a dropped connection in between left the status as
-- the app first guessed it. save_sale_with_items_atomic (also used by
-- save_sale_with_items_numbered) now runs the same compute_sale_settlement right after the
-- lines are in and writes the result the same way, then returns the settled bill with
-- "settled": true.
--
-- If the settlement check itself fails, the bill is still saved (as before, where a failed
-- recompute was only logged): "settled" is false and the app recomputes as it did before.
-- Bills that apply credit or an exchange are still recomputed by the app after that step.
-- Same signature, grants and behaviour otherwise as 20270416120000.
-- UNDO: re-run 20270416120000_save_sale_with_items_atomic.sql.

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
  v_new_paid numeric;
  v_new_status text;
  v_settled boolean := false;
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

  -- Settle paid_amount / payment_status now that the lines are in (same rules as the app's
  -- applyRecomputedSalePaymentState). A failure here keeps the bill; the app recomputes.
  BEGIN
    SELECT c.new_paid, c.new_status
      INTO v_new_paid, v_new_status
    FROM public.compute_sale_settlement(v_sale_id, p_organization_id) c;
    IF v_new_paid IS NOT NULL THEN
      v_new_paid := round(v_new_paid, 2);
      IF abs(coalesce((v_sale_row->>'paid_amount')::numeric, 0) - v_new_paid) > 0.009
         OR coalesce(v_sale_row->>'payment_status', '') IS DISTINCT FROM coalesce(v_new_status, 'pending') THEN
        UPDATE public.sales
        SET paid_amount = v_new_paid,
            payment_status = coalesce(v_new_status, 'pending')
        WHERE id = v_sale_id
          AND organization_id = p_organization_id
        RETURNING to_jsonb(sales.*) INTO v_sale_row;
      END IF;
      v_settled := true;
    END IF;
  EXCEPTION WHEN OTHERS THEN
    RAISE WARNING 'save_sale_with_items_atomic: settlement check skipped for sale %: %', v_sale_id, SQLERRM;
    v_settled := false;
  END;

  RETURN jsonb_build_object(
    'settled', v_settled,
    'sale', v_sale_row,
    'items_inserted', v_count,
    'dropped_sale_keys', to_jsonb(v_dropped_sale),
    'dropped_item_keys', to_jsonb(v_dropped_items)
  );
END;
$$;

REVOKE ALL ON FUNCTION public.save_sale_with_items_atomic(uuid, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sale_with_items_atomic(uuid, jsonb, jsonb) TO authenticated;
