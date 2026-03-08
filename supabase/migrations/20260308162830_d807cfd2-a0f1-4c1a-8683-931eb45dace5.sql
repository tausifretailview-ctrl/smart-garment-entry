
-- Drop existing function first (uses old parameter name p_organization_id)
DROP FUNCTION IF EXISTS public.generate_next_barcode(UUID);

-- Recreate with the same parameter name for backward compatibility
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_num    BIGINT;
  v_barcode TEXT;
  v_max_attempts INTEGER := 1000;
  v_attempt INTEGER := 0;
BEGIN
  UPDATE barcode_sequences
  SET next_number = next_number + 1, updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING prefix, next_number - 1 INTO v_prefix, v_num;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No barcode sequence for org %', p_organization_id;
  END IF;

  v_barcode := v_prefix || LPAD(v_num::TEXT, 7, '0');

  -- Skip collisions with existing barcodes
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode AND organization_id = p_organization_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequences
    SET next_number = next_number + 1, updated_at = now()
    WHERE organization_id = p_organization_id
    RETURNING next_number - 1 INTO v_num;
    v_barcode := v_prefix || LPAD(v_num::TEXT, 7, '0');
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN v_barcode;
END; $$;

GRANT EXECUTE ON FUNCTION public.generate_next_barcode(UUID) TO authenticated;
