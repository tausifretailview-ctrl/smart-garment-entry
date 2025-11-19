-- Add organization_id to bill_number_sequence table
ALTER TABLE public.bill_number_sequence
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Update unique constraint to include organization_id
ALTER TABLE public.bill_number_sequence
DROP CONSTRAINT IF EXISTS bill_number_sequence_month_year_key;

ALTER TABLE public.bill_number_sequence
ADD CONSTRAINT bill_number_sequence_month_year_org_key 
UNIQUE (month, year, organization_id);

-- Add organization_id to barcode_sequence table
ALTER TABLE public.barcode_sequence
ADD COLUMN organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE;

-- Create unique constraint for barcode sequence per organization
ALTER TABLE public.barcode_sequence
ADD CONSTRAINT barcode_sequence_org_key UNIQUE (organization_id);

-- Drop old function and create new one with organization_id parameter
DROP FUNCTION IF EXISTS public.generate_sale_number();

CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id UUID)
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
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  -- Format as YY-YY (e.g., 25-26)
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  -- Get the next number for this financial year and organization
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 'INV/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.sales
  WHERE sale_number LIKE 'INV/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  -- Format: INV/YY-YY/N (e.g., INV/25-26/1)
  invoice_num := 'INV/' || financial_year || '/' || next_number::TEXT;
  
  RETURN invoice_num;
END;
$function$;

-- Drop old function and create new one with organization_id parameter
DROP FUNCTION IF EXISTS public.generate_purchase_bill_number(DATE);

CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_date DATE DEFAULT CURRENT_DATE, p_organization_id UUID DEFAULT NULL)
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
  -- Extract month and year (YY format)
  v_month := EXTRACT(MONTH FROM p_date);
  v_year := EXTRACT(YEAR FROM p_date) % 100;
  
  -- Get or create sequence for this month/year/organization
  INSERT INTO bill_number_sequence (month, year, organization_id, next_sequence)
  VALUES (v_month, v_year, p_organization_id, 1)
  ON CONFLICT (month, year, organization_id) 
  DO UPDATE SET 
    next_sequence = bill_number_sequence.next_sequence + 1,
    updated_at = NOW()
  RETURNING next_sequence INTO v_sequence;
  
  -- Format: BMMYYNNN (e.g., B0125001)
  v_bill_no := 'B' || 
               LPAD(v_month::TEXT, 2, '0') || 
               LPAD(v_year::TEXT, 2, '0') || 
               LPAD(v_sequence::TEXT, 3, '0');
  
  RETURN v_bill_no;
END;
$function$;

-- Drop old function and create new one with organization_id parameter
DROP FUNCTION IF EXISTS public.generate_next_barcode();

CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id UUID)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  new_barcode BIGINT;
BEGIN
  -- Insert or update sequence for this organization
  INSERT INTO public.barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, 10001002)
  ON CONFLICT (organization_id)
  DO UPDATE SET
    next_barcode = barcode_sequence.next_barcode + 1,
    updated_at = now()
  RETURNING next_barcode - 1 INTO new_barcode;
  
  -- Return as text (padded to 8 digits for consistency)
  RETURN LPAD(new_barcode::TEXT, 8, '0');
END;
$function$;