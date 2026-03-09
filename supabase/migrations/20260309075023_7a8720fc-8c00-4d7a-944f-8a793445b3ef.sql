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
BEGIN
  -- Use the existing barcode_sequence table
  UPDATE barcode_sequence
  SET next_barcode = next_barcode + 1, updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING next_barcode - 1 INTO v_num;

  IF NOT FOUND THEN
    -- Auto-create a sequence row for this org starting at 1
    INSERT INTO barcode_sequence (organization_id, next_barcode, updated_at)
    VALUES (p_organization_id, 2, now());
    v_num := 1;
  END IF;

  v_barcode := LPAD(v_num::TEXT, 13, '0');

  -- Skip collisions with existing barcodes
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode AND organization_id = p_organization_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequence
    SET next_barcode = next_barcode + 1, updated_at = now()
    WHERE organization_id = p_organization_id
    RETURNING next_barcode - 1 INTO v_num;
    v_barcode := LPAD(v_num::TEXT, 13, '0');
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN v_barcode;
END; $function$;