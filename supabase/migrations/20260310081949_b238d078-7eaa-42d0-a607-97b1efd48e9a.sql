
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num    BIGINT;
  v_barcode TEXT;
  v_max_attempts INTEGER := 1000;
  v_attempt INTEGER := 0;
  v_digits INTEGER := 13;
  v_settings_data JSONB;
BEGIN
  -- Read barcode_digits from settings table
  SELECT (bill_barcode_settings::jsonb)->>'barcode_digits'
  INTO v_settings_data
  FROM settings
  WHERE organization_id = p_organization_id
  LIMIT 1;

  IF v_settings_data IS NOT NULL AND v_settings_data::text ~ '^\d+$' THEN
    v_digits := v_settings_data::integer;
    IF v_digits < 8 THEN v_digits := 8; END IF;
    IF v_digits > 13 THEN v_digits := 13; END IF;
  END IF;

  -- Use the existing barcode_sequence table
  UPDATE barcode_sequence
  SET next_barcode = next_barcode + 1, updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING next_barcode - 1 INTO v_num;

  IF NOT FOUND THEN
    INSERT INTO barcode_sequence (organization_id, next_barcode, updated_at)
    VALUES (p_organization_id, 2, now());
    v_num := 1;
  END IF;

  v_barcode := LPAD(v_num::TEXT, v_digits, '0');

  -- Skip collisions with existing barcodes
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode AND organization_id = p_organization_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequence
    SET next_barcode = next_barcode + 1, updated_at = now()
    WHERE organization_id = p_organization_id
    RETURNING next_barcode - 1 INTO v_num;
    v_barcode := LPAD(v_num::TEXT, v_digits, '0');
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN v_barcode;
END; $function$;
