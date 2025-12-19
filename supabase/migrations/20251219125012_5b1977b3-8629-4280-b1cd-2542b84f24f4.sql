-- Update generate_sale_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id uuid)
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 'INV/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE sale_number LIKE 'INV/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  invoice_num := 'INV/' || financial_year || '/' || next_number::TEXT;
  
  RETURN invoice_num;
END;
$function$;

-- Update generate_pos_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_pos_number(p_organization_id uuid)
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
  pos_num TEXT;
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 'POS/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM sales
  WHERE sale_number LIKE 'POS/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  pos_num := 'POS/' || financial_year || '/' || next_number::TEXT;
  
  RETURN pos_num;
END;
$function$;

-- Update generate_quotation_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_organization_id uuid)
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
  quotation_num TEXT;
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'QT/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.quotations
  WHERE quotation_number LIKE 'QT/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  quotation_num := 'QT/' || financial_year || '/' || next_number::TEXT;
  
  RETURN quotation_num;
END;
$function$;

-- Update generate_sale_order_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_sale_order_number(p_organization_id uuid)
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
  order_num TEXT;
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'SO/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sale_orders
  WHERE order_number LIKE 'SO/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  order_num := 'SO/' || financial_year || '/' || next_number::TEXT;
  
  RETURN order_num;
END;
$function$;

-- Update generate_sale_return_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_sale_return_number(p_organization_id uuid)
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
  return_num TEXT;
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM 'SR/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM sale_returns
  WHERE return_number LIKE 'SR/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  return_num := 'SR/' || financial_year || '/' || next_number::TEXT;
  
  RETURN return_num;
END;
$function$;

-- Update generate_credit_note_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_credit_note_number(p_organization_id uuid)
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
  cn_num TEXT;
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(credit_note_number FROM 'CN/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.credit_notes
  WHERE credit_note_number LIKE 'CN/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  cn_num := 'CN/' || financial_year || '/' || next_number::TEXT;
  
  RETURN cn_num;
END;
$function$;

-- Update generate_purchase_bill_number to exclude soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_date date DEFAULT CURRENT_DATE, p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_month INTEGER;
  v_year INTEGER;
  v_sequence INTEGER;
  v_bill_no TEXT;
BEGIN
  v_month := EXTRACT(MONTH FROM p_date);
  v_year := EXTRACT(YEAR FROM p_date) % 100;
  
  -- Get next sequence by finding MAX from non-deleted bills
  SELECT COALESCE(MAX(CAST(SUBSTRING(software_bill_no FROM 'B\d{4}(\d+)$') AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM purchase_bills
  WHERE software_bill_no LIKE 'B' || LPAD(v_month::TEXT, 2, '0') || LPAD(v_year::TEXT, 2, '0') || '%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  v_bill_no := 'B' || 
               LPAD(v_month::TEXT, 2, '0') || 
               LPAD(v_year::TEXT, 2, '0') || 
               LPAD(v_sequence::TEXT, 3, '0');
  
  RETURN v_bill_no;
END;
$function$;

-- Create generate_purchase_return_number if it doesn't exist (exclude soft-deleted records)
CREATE OR REPLACE FUNCTION public.generate_purchase_return_number(p_organization_id uuid)
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
  return_num TEXT;
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
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM 'PR/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM purchase_returns
  WHERE return_number LIKE 'PR/' || financial_year || '/%'
    AND organization_id = p_organization_id
    AND deleted_at IS NULL;
  
  return_num := 'PR/' || financial_year || '/' || next_number::TEXT;
  
  RETURN return_num;
END;
$function$;