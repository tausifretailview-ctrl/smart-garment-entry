CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_number INTEGER;
  v_next_barcode BIGINT;
  v_starting_barcode BIGINT;
  v_max_attempts INTEGER := 1000;
  v_attempt INTEGER := 0;
BEGIN
  SELECT organization_number INTO v_org_number
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_number IS NULL THEN
    RAISE EXCEPTION 'Organization number not set for organization %', p_organization_id;
  END IF;

  v_starting_barcode := (v_org_number * 10000000) + 1001;

  INSERT INTO public.barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, v_starting_barcode + 1)
  ON CONFLICT (organization_id)
  DO UPDATE SET
    next_barcode = barcode_sequence.next_barcode + 1,
    updated_at = now()
  RETURNING next_barcode - 1 INTO v_next_barcode;

  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = LPAD(v_next_barcode::TEXT, 10, '0')
    AND organization_id = p_organization_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequence
    SET next_barcode = next_barcode + 1, updated_at = now()
    WHERE organization_id = p_organization_id
    RETURNING next_barcode - 1 INTO v_next_barcode;
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN LPAD(v_next_barcode::TEXT, 10, '0');
END;
$$;