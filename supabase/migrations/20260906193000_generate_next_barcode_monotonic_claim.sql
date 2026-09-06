-- generate_next_barcode: keep filling active-only holes, but start the search
-- at the claimed sequence value so consecutive calls (purchase new-product
-- size grid, before any row is inserted) do not all return the same first hole.

CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_num BIGINT;
  v_barcode TEXT;
  v_min_digits INTEGER;
  v_digits INTEGER;
  v_org_number INTEGER;
  v_starting_barcode BIGINT;
  v_claimed BIGINT;
  v_search_from BIGINT;
  v_search_end BIGINT;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'p_organization_id is required';
  END IF;
  IF auth.role() = 'anon'
  OR (
    auth.role() = 'authenticated'
    AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
  ) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  SELECT COALESCE(
    ((bill_barcode_settings::jsonb)->>'barcode_digits')::integer,
    8
  )
  INTO v_min_digits
  FROM settings
  WHERE organization_id = p_organization_id;

  IF v_min_digits IS NULL THEN
    v_min_digits := 8;
  END IF;
  IF v_min_digits < 8 THEN v_min_digits := 8; END IF;
  IF v_min_digits > 13 THEN v_min_digits := 13; END IF;

  SELECT COALESCE(organization_number, 1) INTO v_org_number
  FROM organizations WHERE id = p_organization_id;

  v_starting_barcode := (v_org_number::bigint * 10000000) + 1001;

  INSERT INTO barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, v_starting_barcode)
  ON CONFLICT (organization_id) DO NOTHING;

  UPDATE barcode_sequence
  SET next_barcode = next_barcode + 1, updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING next_barcode - 1 INTO v_claimed;

  v_digits := v_min_digits;
  WHILE v_starting_barcode > ((10::bigint ^ v_digits) - 1) AND v_digits < 13 LOOP
    v_digits := v_digits + 1;
  END LOOP;

  v_search_from := GREATEST(v_starting_barcode, v_claimed);
  v_search_end := v_search_from + 1000;

  SELECT gs
  INTO v_num
  FROM generate_series(v_search_from, v_search_end) AS gs
  WHERE NOT EXISTS (
    SELECT 1
    FROM product_variants pv
    WHERE pv.organization_id = p_organization_id
      AND pv.deleted_at IS NULL
      AND pv.barcode = LPAD(gs::text, v_digits, '0')
  )
  ORDER BY gs
  LIMIT 1;

  IF v_num IS NULL THEN
    v_num := v_search_from;
  END IF;

  WHILE v_num > ((10::bigint ^ v_digits) - 1) AND v_digits < 13 LOOP
    v_digits := v_digits + 1;
  END LOOP;

  v_barcode := LPAD(v_num::text, v_digits, '0');

  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode
      AND organization_id = p_organization_id
      AND deleted_at IS NULL
  ) LOOP
    v_num := v_num + 1;
    WHILE v_num > ((10::bigint ^ v_digits) - 1) AND v_digits < 13 LOOP
      v_digits := v_digits + 1;
    END LOOP;
    v_barcode := LPAD(v_num::text, v_digits, '0');
  END LOOP;

  UPDATE barcode_sequence
  SET next_barcode = GREATEST(next_barcode, v_num + 1), updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN v_barcode;
END;
$function$;

COMMENT ON FUNCTION public.generate_next_barcode(uuid) IS
  'Next org-series barcode. Fills holes at/after the claimed sequence (unique across consecutive calls before insert). Fail-closed org guard.';

REVOKE ALL ON FUNCTION public.generate_next_barcode(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.generate_next_barcode(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.generate_next_barcode(uuid) TO authenticated, service_role;
