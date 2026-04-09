
-- Self-healing generate_pos_number_atomic
CREATE OR REPLACE FUNCTION public.generate_pos_number_atomic(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  v_actual_max INTEGER;
  ist_date DATE;
  fy_start INTEGER; fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date); fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date); fy_start := fy_end - 1;
  END IF;
  v_series := 'POS/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2) || '-'
                      || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  -- Self-healing: ensure we're ahead of actual max in sales table
  SELECT COALESCE(MAX(CAST(regexp_replace(sale_number, '.*/', '') AS INTEGER)), 0)
  INTO v_actual_max
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_series || '/%'
    AND deleted_at IS NULL;

  IF v_next <= v_actual_max THEN
    v_next := v_actual_max + 1;
    UPDATE bill_number_sequences
    SET last_number = v_next
    WHERE organization_id = p_organization_id AND series = v_series;
  END IF;

  RETURN v_series || '/' || v_next::TEXT;
END;
$$;

-- Self-healing generate_sale_number_atomic
CREATE OR REPLACE FUNCTION public.generate_sale_number_atomic(p_organization_id UUID, p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  v_actual_max INTEGER;
  ist_date DATE;
  fy_start INTEGER; fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date); fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date); fy_start := fy_end - 1;
  END IF;
  v_series := p_prefix || '/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2)
                               || '-' || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  -- Self-healing: ensure we're ahead of actual max in sales table
  SELECT COALESCE(MAX(CAST(regexp_replace(sale_number, '.*/', '') AS INTEGER)), 0)
  INTO v_actual_max
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_series || '/%'
    AND deleted_at IS NULL;

  IF v_next <= v_actual_max THEN
    v_next := v_actual_max + 1;
    UPDATE bill_number_sequences
    SET last_number = v_next
    WHERE organization_id = p_organization_id AND series = v_series;
  END IF;

  RETURN v_series || '/' || v_next::TEXT;
END;
$$;
