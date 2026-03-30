
-- Drop the overloaded purchase bill number function with defaults first
DROP FUNCTION IF EXISTS public.generate_purchase_bill_number(DATE, UUID);

-- Recreate with IST timezone
CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_date DATE DEFAULT (now() AT TIME ZONE 'Asia/Kolkata')::date, p_organization_id UUID DEFAULT NULL)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE v_prefix TEXT := 'PUR'; v_count INTEGER; financial_year TEXT; current_month INTEGER; current_year INTEGER; fy_start_year INTEGER; fy_end_year INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM p_date);
  current_year := EXTRACT(YEAR FROM p_date);
  IF current_month >= 4 THEN fy_start_year := current_year; fy_end_year := current_year + 1;
  ELSE fy_start_year := current_year - 1; fy_end_year := current_year; END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(software_bill_no FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1 INTO v_count
  FROM purchase_bills WHERE organization_id = p_organization_id AND software_bill_no LIKE v_prefix || '/' || financial_year || '/%' AND deleted_at IS NULL;
  RETURN v_prefix || '/' || financial_year || '/' || v_count::TEXT;
END;
$$;
