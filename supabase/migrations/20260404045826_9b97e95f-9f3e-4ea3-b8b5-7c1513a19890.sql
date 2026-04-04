CREATE OR REPLACE FUNCTION public.generate_fee_receipt_number(
  p_organization_id UUID,
  p_fy_start_year INTEGER DEFAULT NULL,
  p_fy_end_year INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence        INTEGER;
  v_number          TEXT;
  v_financial_year  TEXT;
  current_month     INTEGER;
  current_year_val  INTEGER;
  fy_start_year     INTEGER;
  fy_end_year       INTEGER;
BEGIN
  IF p_fy_start_year IS NOT NULL AND p_fy_end_year IS NOT NULL THEN
    fy_start_year := p_fy_start_year;
    fy_end_year := p_fy_end_year;
  ELSE
    current_month := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::date);
    current_year_val := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::date);
    IF current_month >= 4 THEN
      fy_start_year := current_year_val;
      fy_end_year := current_year_val + 1;
    ELSE
      fy_start_year := current_year_val - 1;
      fy_end_year := current_year_val;
    END IF;
  END IF;

  v_financial_year :=
    fy_start_year::TEXT || '-' ||
    SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Try to atomically claim the current sequence and increment for next use
  UPDATE public.fee_receipt_sequence
  SET next_sequence = next_sequence + 1,
      updated_at = now()
  WHERE organization_id = p_organization_id
    AND financial_year = v_financial_year
  RETURNING next_sequence - 1 INTO v_sequence;

  -- If no row existed, create one starting at 1 (next will be 2)
  IF v_sequence IS NULL THEN
    INSERT INTO public.fee_receipt_sequence (organization_id, financial_year, next_sequence)
    VALUES (p_organization_id, v_financial_year, 2)
    ON CONFLICT (organization_id, financial_year)
    DO UPDATE SET
      next_sequence = fee_receipt_sequence.next_sequence + 1,
      updated_at = now()
    RETURNING next_sequence - 1 INTO v_sequence;

    -- If we hit the conflict branch above, v_sequence is already set
    -- If we did the fresh insert, v_sequence is 2-1=1
  END IF;

  v_number := 'RCT/' || v_financial_year || '/' || v_sequence::TEXT;

  RETURN v_number;
END;
$$;