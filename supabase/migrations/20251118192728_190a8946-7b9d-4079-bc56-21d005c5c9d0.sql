-- Update the generate_sale_number function to use INV/YY-YY/N format
-- Financial year: Apr-Mar (e.g., 2025-04-01 to 2026-03-31 = 25-26)
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  next_number INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  invoice_num TEXT;
BEGIN
  -- Get current month and year
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  -- Calculate financial year (Apr-Mar)
  IF current_month >= 4 THEN
    -- April to December: FY starts this year
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    -- January to March: FY started last year
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  -- Format as YY-YY (e.g., 25-26)
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  -- Get the next number for this financial year
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 'INV/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE sale_number LIKE 'INV/' || financial_year || '/%';
  
  -- Format: INV/YY-YY/N (e.g., INV/25-26/1)
  invoice_num := 'INV/' || financial_year || '/' || next_number::TEXT;
  
  RETURN invoice_num;
END;
$function$;