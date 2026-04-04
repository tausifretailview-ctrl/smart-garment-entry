CREATE OR REPLACE FUNCTION public.peek_fee_receipt_number(
  p_organization_id UUID,
  p_fy_start_year INTEGER DEFAULT NULL,
  p_fy_end_year INTEGER DEFAULT NULL
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_sequence      INTEGER;
  v_number        TEXT;
  v_financial_year TEXT;
  current_month   INTEGER;
  current_year_val INTEGER;
  fy_start_year   INTEGER;
  fy_end_year     INTEGER;
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

  SELECT next_sequence INTO v_sequence
  FROM public.fee_receipt_sequence
  WHERE organization_id = p_organization_id
    AND financial_year = v_financial_year;

  IF v_sequence IS NULL THEN
    v_sequence := 1;
  END IF;

  v_number := 'RCT/' || v_financial_year || '/' || v_sequence::TEXT;

  RETURN v_number;
END;
$$;