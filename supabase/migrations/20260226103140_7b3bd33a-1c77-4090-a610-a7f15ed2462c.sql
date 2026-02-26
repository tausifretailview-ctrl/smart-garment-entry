
-- Function to generate sequential fee receipt numbers per financial year
CREATE OR REPLACE FUNCTION public.generate_fee_receipt_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_count INTEGER;
  v_number TEXT;
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
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 1 FOR 4) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  -- Get next sequential number for this org and financial year
  SELECT COALESCE(MAX(
    CAST(REGEXP_REPLACE(payment_receipt_id, '^RCT/' || financial_year || '/', '') AS INTEGER)
  ), 0) + 1
  INTO v_count
  FROM student_fees
  WHERE organization_id = p_organization_id
    AND payment_receipt_id LIKE 'RCT/' || financial_year || '/%';
  
  v_number := 'RCT/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$function$;
