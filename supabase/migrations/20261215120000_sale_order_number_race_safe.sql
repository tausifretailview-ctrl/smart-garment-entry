-- KS FOOTWEAR (and any busy shop) hit unique(organization_id, order_number)
-- because generate_sale_order_number was MAX+1 with no lock: two sale-order
-- saves (desktop + salesman) allocated the same SO/YY-YY/N. Client retries
-- still called the same MAX+1 RPC, so they could all collide.
--
-- Pattern: pg_advisory_xact_lock(org:SO:FY) + persist next value on
-- bill_number_sequences (GREATEST(seq, live max)+1) + EXISTS skip.
-- Preview uses peek_sale_order_number (MAX+1, no consume).

CREATE OR REPLACE FUNCTION public.peek_sale_order_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  financial_year TEXT;
  ist_date DATE;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'peek_sale_order_number: organization_id is required';
  END IF;

  IF auth.role() = 'anon'
  OR (auth.role() = 'authenticated'
      AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start_year := EXTRACT(YEAR FROM ist_date)::integer;
    fy_end_year := fy_start_year + 1;
  ELSE
    fy_end_year := EXTRACT(YEAR FROM ist_date)::integer;
    fy_start_year := fy_end_year - 1;
  END IF;

  financial_year :=
    SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2)
    || '-'
    || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(order_number FROM 'SO/\d+-\d+/(\d+)$') AS INTEGER)),
    0
  ) + 1
  INTO v_count
  FROM public.sale_orders
  WHERE organization_id = p_organization_id
    AND order_number LIKE 'SO/' || financial_year || '/%'
    AND deleted_at IS NULL;

  RETURN 'SO/' || financial_year || '/' || v_count::TEXT;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_sale_order_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  v_actual_max INTEGER;
  v_number TEXT;
  financial_year TEXT;
  ist_date DATE;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  v_exists BOOLEAN;
  v_iter INTEGER := 0;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'generate_sale_order_number: organization_id is required';
  END IF;

  IF auth.role() = 'anon'
  OR (auth.role() = 'authenticated'
      AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start_year := EXTRACT(YEAR FROM ist_date)::integer;
    fy_end_year := fy_start_year + 1;
  ELSE
    fy_end_year := EXTRACT(YEAR FROM ist_date)::integer;
    fy_start_year := fy_end_year - 1;
  END IF;

  financial_year :=
    SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2)
    || '-'
    || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  v_series := 'SO/' || financial_year;

  PERFORM pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':SO:' || financial_year)
  );

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(order_number FROM 'SO/\d+-\d+/(\d+)$') AS INTEGER)),
    0
  )
  INTO v_actual_max
  FROM public.sale_orders
  WHERE organization_id = p_organization_id
    AND order_number LIKE v_series || '/%'
    AND deleted_at IS NULL;

  INSERT INTO public.bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, v_actual_max + 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = GREATEST(public.bill_number_sequences.last_number, v_actual_max) + 1
  RETURNING last_number INTO v_next;

  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 10000 THEN
      RAISE EXCEPTION
        'generate_sale_order_number exceeded 10000 iterations for org % / %',
        p_organization_id, financial_year;
    END IF;

    v_number := v_series || '/' || v_next::TEXT;

    SELECT EXISTS(
      SELECT 1
      FROM public.sale_orders
      WHERE organization_id = p_organization_id
        AND order_number = v_number
        AND deleted_at IS NULL
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_next := v_next + 1;
  END LOOP;

  UPDATE public.bill_number_sequences
  SET last_number = v_next
  WHERE organization_id = p_organization_id
    AND series = v_series;

  RETURN v_number;
END;
$function$;

COMMENT ON FUNCTION public.peek_sale_order_number(uuid) IS
  'Preview next SO/YY-YY/N for an org. Does not consume bill_number_sequences.';

COMMENT ON FUNCTION public.generate_sale_order_number(uuid) IS
  'Race-safe SO/YY-YY/N per organization. Advisory lock + bill_number_sequences GREATEST(seq, live max)+1 + EXISTS skip. Unique index sale_orders_organization_order_number_key.';

REVOKE EXECUTE ON FUNCTION public.peek_sale_order_number(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.peek_sale_order_number(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.peek_sale_order_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.peek_sale_order_number(uuid) TO service_role;

REVOKE EXECUTE ON FUNCTION public.generate_sale_order_number(uuid) FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.generate_sale_order_number(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_sale_order_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_sale_order_number(uuid) TO service_role;
