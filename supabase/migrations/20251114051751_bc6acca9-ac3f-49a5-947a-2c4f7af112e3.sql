-- Fix security: Set search_path for generate_sale_number function
CREATE OR REPLACE FUNCTION public.generate_sale_number()
RETURNS TEXT 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  current_year TEXT;
  sale_num TEXT;
BEGIN
  current_year := TO_CHAR(CURRENT_DATE, 'YY-YY');
  
  -- Get the next number for this year
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM '\d+$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE sale_number LIKE 'SALE/' || current_year || '/%';
  
  sale_num := 'SALE/' || current_year || '/' || LPAD(next_number::TEXT, 5, '0');
  
  RETURN sale_num;
END;
$$;