-- Plan Phase 2, step 2: take the bill number inside the same transaction as the bill.
--
-- Until now the app asked for the next POS / INV number in one request and saved the bill
-- in another. The number functions lock the series (advisory lock or the
-- bill_number_sequences row) only until the end of their own request, then work out
-- MAX(active bills) + 1. Two counters saving at the same moment could both get the same
-- number; the second save then failed on uq_sales_org_number_active ("Bill number
-- conflict, try again"). A failed save could also leave the counter moved on.
--
-- save_sale_with_items_numbered calls the SAME number function the app called before,
-- then save_sale_with_items_atomic, all in one transaction. The series lock is now held
-- until the bill and its lines are committed, so the next counter waits a moment and then
-- gets the following number. If anything fails, the number is not used up.
--
-- p_numbering (built by the app from Settings, exactly as before):
--   { "kind": "pos" | "sale",
--     "format": "POS/{YY}-{YY}/{###}" | null,   -- null = default POS/YY-YY/N or INV/YY-YY/N
--     "year": "2026", "month": "11", "min_sequence": 1 }
-- DC bills, offline bills (number already printed) and held bills keep their own numbering.
-- SECURITY INVOKER, membership checked before any number is taken.
-- UNDO: DROP FUNCTION public.save_sale_with_items_numbered(uuid, jsonb, jsonb, jsonb);
--       (the app then takes the number first, as before.)

CREATE OR REPLACE FUNCTION public.save_sale_with_items_numbered(
  p_organization_id uuid,
  p_sale jsonb,
  p_items jsonb,
  p_numbering jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_kind text;
  v_format text;
  v_year text;
  v_month text;
  v_min integer;
  v_number text;
  v_result jsonb;
BEGIN
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Not signed in' USING ERRCODE = '42501';
  END IF;
  IF p_organization_id IS NULL
     OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;
  IF p_numbering IS NULL OR jsonb_typeof(p_numbering) <> 'object' THEN
    RAISE EXCEPTION 'p_numbering must be an object' USING ERRCODE = '22023';
  END IF;

  v_kind := p_numbering->>'kind';
  IF v_kind IS NULL OR v_kind NOT IN ('pos', 'sale') THEN
    RAISE EXCEPTION 'p_numbering.kind must be pos or sale' USING ERRCODE = '22023';
  END IF;
  v_format := NULLIF(btrim(coalesce(p_numbering->>'format', '')), '');

  -- Large bills: same allowance as save_sale_with_items_atomic (waiting for the series lock counts too).
  PERFORM set_config('statement_timeout', '120s', true);

  IF v_format IS NOT NULL THEN
    v_year := coalesce(NULLIF(p_numbering->>'year', ''), to_char(now() AT TIME ZONE 'Asia/Kolkata', 'YYYY'));
    v_month := coalesce(NULLIF(p_numbering->>'month', ''), to_char(now() AT TIME ZONE 'Asia/Kolkata', 'MM'));
    v_min := GREATEST(coalesce(NULLIF(p_numbering->>'min_sequence', '')::integer, 1), 1);
    IF v_kind = 'pos' THEN
      v_number := public.generate_custom_pos_number(p_organization_id, v_format, v_year, v_month, v_min);
    ELSE
      v_number := public.generate_custom_sale_number(p_organization_id, v_format, v_year, v_month, v_min);
    END IF;
  ELSIF v_kind = 'pos' THEN
    v_number := public.generate_pos_number_atomic(p_organization_id);
  ELSE
    v_number := public.generate_sale_number_atomic(p_organization_id);
  END IF;

  IF v_number IS NULL OR btrim(v_number) = '' THEN
    RAISE EXCEPTION 'Could not get the next bill number' USING ERRCODE = 'P0001';
  END IF;

  v_result := public.save_sale_with_items_atomic(
    p_organization_id,
    coalesce(p_sale, '{}'::jsonb) || jsonb_build_object('sale_number', v_number),
    p_items
  );

  RETURN v_result || jsonb_build_object('sale_number', v_number);
END;
$$;

REVOKE ALL ON FUNCTION public.save_sale_with_items_numbered(uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.save_sale_with_items_numbered(uuid, jsonb, jsonb, jsonb) TO authenticated;

COMMENT ON FUNCTION public.save_sale_with_items_numbered(uuid, jsonb, jsonb, jsonb) IS
  'Takes the next POS/INV number and saves the bill with its lines in one transaction (Plan Phase 2 step 2).';
