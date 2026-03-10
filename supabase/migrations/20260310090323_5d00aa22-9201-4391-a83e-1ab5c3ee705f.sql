
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_num BIGINT;
  v_barcode TEXT;
  v_exists BOOLEAN;
  v_min_digits INTEGER;
  v_digits INTEGER;
  v_max_val BIGINT;
BEGIN
  -- Get configured minimum digits (default 8)
  SELECT COALESCE(
    ((bill_barcode_settings::jsonb)->>'barcode_digits')::integer,
    8
  )
  INTO v_min_digits
  FROM settings
  WHERE organization_id = p_organization_id;

  -- If no settings row, default to 8
  IF v_min_digits IS NULL THEN
    v_min_digits := 8;
  END IF;

  -- Clamp between 8 and 13
  IF v_min_digits < 8 THEN v_min_digits := 8; END IF;
  IF v_min_digits > 13 THEN v_min_digits := 13; END IF;

  -- Upsert sequence
  INSERT INTO barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, 1)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Get and increment
  UPDATE barcode_sequence
  SET next_barcode = next_barcode + 1, updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING next_barcode - 1 INTO v_num;

  -- Auto-scale: determine how many digits are needed
  v_digits := v_min_digits;
  v_max_val := (10::bigint ^ v_digits) - 1;

  -- If number exceeds current digit capacity, scale up (max 13)
  WHILE v_num > v_max_val AND v_digits < 13 LOOP
    v_digits := v_digits + 1;
    v_max_val := (10::bigint ^ v_digits) - 1;
  END LOOP;

  v_barcode := LPAD(v_num::TEXT, v_digits, '0');

  -- Collision check
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode AND organization_id = p_organization_id
  ) LOOP
    v_num := v_num + 1;
    -- Re-check digit scaling for the new number
    WHILE v_num > (10::bigint ^ v_digits) - 1 AND v_digits < 13 LOOP
      v_digits := v_digits + 1;
    END LOOP;
    v_barcode := LPAD(v_num::TEXT, v_digits, '0');
  END LOOP;

  -- Update sequence to reflect actual next value
  UPDATE barcode_sequence
  SET next_barcode = v_num + 1, updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN v_barcode;
END;
$$;
