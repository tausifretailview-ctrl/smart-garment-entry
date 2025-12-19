-- Update generate_voucher_number to exclude soft-deleted vouchers for number reuse
CREATE OR REPLACE FUNCTION public.generate_voucher_number(p_type text, p_date date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_number TEXT;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  -- Set prefix based on type
  v_prefix := CASE p_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'receipt' THEN 'RCP'
    WHEN 'expense' THEN 'EXP'
    WHEN 'journal' THEN 'JV'
    WHEN 'contra' THEN 'CNT'
    ELSE 'VCH'
  END;
  
  -- Get current month and year
  current_month := EXTRACT(MONTH FROM p_date);
  current_year := EXTRACT(YEAR FROM p_date);
  
  -- Calculate financial year (Apr-Mar)
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  -- Format as YY-YY (e.g., 25-26)
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  -- Get count for this financial year, excluding soft-deleted vouchers
  SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM voucher_entries
  WHERE voucher_type = p_type
    AND voucher_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  
  -- Format: PREFIX/YY-YY/N (e.g., RCP/25-26/1)
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$function$;