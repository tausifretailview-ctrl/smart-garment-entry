
CREATE OR REPLACE FUNCTION generate_fee_receipt_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_prefix TEXT := 'RCT';
  v_count INTEGER;
  v_count_old INTEGER;
  financial_year TEXT;
  financial_year_old TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM now() AT TIME ZONE 'Asia/Kolkata');
  current_year := EXTRACT(YEAR FROM now() AT TIME ZONE 'Asia/Kolkata');

  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;

  -- New 2-digit format: RCT/25-26/N
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  -- Old 4-digit format: RCT/2025-26/N
  financial_year_old := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Max from new format
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(payment_receipt_id FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER
      )
    ), 0
  )
  INTO v_count
  FROM student_fees
  WHERE organization_id = p_organization_id
    AND payment_receipt_id LIKE v_prefix || '/' || financial_year || '/%';

  -- Max from old format
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(payment_receipt_id FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER
      )
    ), 0
  )
  INTO v_count_old
  FROM student_fees
  WHERE organization_id = p_organization_id
    AND payment_receipt_id LIKE v_prefix || '/' || financial_year_old || '/%';

  -- Use the greater of both
  IF v_count_old > v_count THEN
    v_count := v_count_old;
  END IF;

  RETURN v_prefix || '/' || financial_year || '/' || (v_count + 1)::TEXT;
END;
$$;
