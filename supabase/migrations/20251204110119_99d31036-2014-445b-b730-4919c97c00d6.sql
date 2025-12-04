-- Step 1: Add organization-scoped unique constraint for purchase bills
CREATE UNIQUE INDEX IF NOT EXISTS purchase_bills_organization_software_bill_no_key 
ON public.purchase_bills USING btree (organization_id, software_bill_no);

-- Step 2: Add return_number column to purchase_returns
ALTER TABLE public.purchase_returns 
ADD COLUMN IF NOT EXISTS return_number text;

-- Step 3: Create organization-scoped unique constraint for purchase return numbers
CREATE UNIQUE INDEX IF NOT EXISTS purchase_returns_organization_return_number_key 
ON public.purchase_returns USING btree (organization_id, return_number);

-- Step 4: Create function to generate purchase return numbers
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
  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM 'PR/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM purchase_returns
  WHERE return_number LIKE 'PR/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  -- Format: PR/YY-YY/N (e.g., PR/25-26/1)
  return_num := 'PR/' || financial_year || '/' || next_number::TEXT;
  
  RETURN return_num;
END;
$function$;