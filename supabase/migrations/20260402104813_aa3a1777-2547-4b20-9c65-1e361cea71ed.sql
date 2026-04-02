
CREATE OR REPLACE FUNCTION public.generate_fee_receipt_number(p_organization_id uuid, p_fy_start_year integer DEFAULT NULL, p_fy_end_year integer DEFAULT NULL)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
  v_number TEXT;
  financial_year TEXT;
  current_month INTEGER;
  current_year_val INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
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

  financial_year :=
    SUBSTRING(fy_start_year::TEXT FROM 1 FOR 4) || '-' ||
    SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Safe regex-based extraction: only parse rows that strictly match RCT/YYYY-YY/digits
  SELECT COALESCE(MAX(
    CASE
      WHEN payment_receipt_id ~ ('^RCT/' || financial_year || '/[0-9]+$')
      THEN CAST(SUBSTRING(payment_receipt_id FROM LENGTH('RCT/' || financial_year || '/') + 1) AS INTEGER)
      ELSE 0
    END
  ), 0) + 1
  INTO v_count
  FROM student_fees
  WHERE organization_id = p_organization_id
    AND payment_receipt_id LIKE 'RCT/' || financial_year || '/%'
    AND status IN ('paid', 'partial');

  v_number := 'RCT/' || financial_year || '/' || v_count::TEXT;

  RETURN v_number;
END;
$$;
