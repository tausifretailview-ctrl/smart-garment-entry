
CREATE OR REPLACE FUNCTION public.generate_fee_receipt_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_prefix TEXT := 'RCT';
  v_count INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);

  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;

  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Query from student_fees.payment_receipt_id (the actual table storing receipts)
  SELECT COALESCE(
    MAX(
      CAST(
        SUBSTRING(payment_receipt_id FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER
      )
    ), 0
  ) + 1
  INTO v_count
  FROM student_fees
  WHERE organization_id = p_organization_id
    AND payment_receipt_id LIKE v_prefix || '/' || financial_year || '/%';

  RETURN v_prefix || '/' || financial_year || '/' || v_count::TEXT;
END;
$$;
