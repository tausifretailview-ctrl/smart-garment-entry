-- Plan Phase 4 (speed): many barcodes from the shop's series in ONE request.
--
-- Purchase Entry's Excel import asked for a barcode per row, one request after another (a
-- 1,000-row import = 1,000 round trips before saving even started). The calls cannot run in
-- parallel: generate_next_barcode fills the first free hole after the claimed sequence value,
-- and two calls in flight can find the same hole because nothing is inserted until the import
-- saves.
--
-- generate_next_barcodes(org, count) calls generate_next_barcode `count` times, one after
-- another, inside one request. Each call moves barcode_sequence on, so the result is exactly
-- what the same number of separate calls would return, in the same order.
-- SECURITY INVOKER: generate_next_barcode does its own shop-membership check.
-- The app falls back to one call per barcode while this function is missing.
-- UNDO: DROP FUNCTION public.generate_next_barcodes(uuid, integer);

CREATE OR REPLACE FUNCTION public.generate_next_barcodes(p_organization_id uuid, p_count integer)
RETURNS text[]
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_out text[] := '{}';
  i integer;
BEGIN
  IF p_count IS NULL OR p_count < 1 THEN
    RETURN v_out;
  END IF;
  IF p_count > 5000 THEN
    RAISE EXCEPTION 'At most 5000 barcodes per request' USING ERRCODE = '22023';
  END IF;
  PERFORM set_config('statement_timeout', '120s', true);
  FOR i IN 1..p_count LOOP
    v_out := v_out || public.generate_next_barcode(p_organization_id);
  END LOOP;
  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.generate_next_barcodes(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.generate_next_barcodes(uuid, integer) TO authenticated;

COMMENT ON FUNCTION public.generate_next_barcodes(uuid, integer) IS
  'Next `count` barcodes of the shop series in one request (same as calling generate_next_barcode count times).';
