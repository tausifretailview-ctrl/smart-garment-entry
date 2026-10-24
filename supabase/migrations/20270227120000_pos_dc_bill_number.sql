-- POS bill with only DC (No GST) items gets a DC number: DC/26-27/1, 2, 3 … (2026-10-24).
-- A mixed bill (DC + normal items) keeps the POS series. Decided by the shop owner 24 Oct 2026.
--
-- WHAT IT DOES
--   1. sales.is_dc_bill: true for a POS bill numbered in the DC series.
--   2. generate_dc_number_atomic(org): next DC/YY-YY/N. Shares the DC numbers already used by
--      Delivery Challans (delivery_challans.challan_number) and the POS Delivery Challan screen
--      (sales.sale_number), so a DC number is never handed out twice. Counter row in
--      bill_number_sequences (series 'DC/YY-YY') locks concurrent POS saves; it only moves
--      forward to the highest number in use, never back.
--
-- SAFETY: additive column + new function. Old bills, Delivery Challans and
-- generate_challan_number are not changed.
-- UNDO: DROP FUNCTION public.generate_dc_number_atomic(uuid);
--       (the app then keeps all-DC bills in the POS series; the column can stay.)

ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_dc_bill boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.generate_dc_number_atomic(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_series text;
  v_next integer;
  v_max_sales integer;
  v_max_challans integer;
  ist_date date;
  fy_start integer;
  fy_end integer;
BEGIN
  PERFORM public._assert_org_access(p_organization_id);

  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date);
    fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date);
    fy_start := fy_end - 1;
  END IF;
  v_series := 'DC/' || SUBSTRING(fy_start::text FROM 3 FOR 2) || '-'
                     || SUBSTRING(fy_end::text FROM 3 FOR 2);

  INSERT INTO public.bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = public.bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(s.sale_number FROM '/(\d+)$'), '')::integer), 0)
    INTO v_max_sales
  FROM public.sales s
  WHERE s.organization_id = p_organization_id
    AND s.sale_number LIKE v_series || '/%';

  SELECT COALESCE(MAX(NULLIF(SUBSTRING(dc.challan_number FROM '/(\d+)$'), '')::integer), 0)
    INTO v_max_challans
  FROM public.delivery_challans dc
  WHERE dc.organization_id = p_organization_id
    AND dc.challan_number LIKE v_series || '/%'
    AND dc.deleted_at IS NULL;

  IF v_next <= GREATEST(v_max_sales, v_max_challans) THEN
    v_next := GREATEST(v_max_sales, v_max_challans) + 1;
    UPDATE public.bill_number_sequences
    SET last_number = v_next
    WHERE organization_id = p_organization_id
      AND series = v_series;
  END IF;

  RETURN v_series || '/' || v_next::text;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.generate_dc_number_atomic(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_dc_number_atomic(uuid) TO authenticated;

COMMENT ON FUNCTION public.generate_dc_number_atomic(uuid) IS
  'Next DC/YY-YY/N for a POS bill of only DC items; shares numbers with Delivery Challans.';
