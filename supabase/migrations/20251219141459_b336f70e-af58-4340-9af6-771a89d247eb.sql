-- Drop existing unique constraints first, then recreate as partial indexes
-- This allows soft-deleted records to have their numbers reused

-- 1. Sales table - drop constraint first if exists
ALTER TABLE sales DROP CONSTRAINT IF EXISTS sales_organization_sale_number_key;
DROP INDEX IF EXISTS sales_organization_sale_number_key;
CREATE UNIQUE INDEX sales_organization_sale_number_key 
ON sales (organization_id, sale_number) 
WHERE deleted_at IS NULL;

-- 2. Purchase bills table
ALTER TABLE purchase_bills DROP CONSTRAINT IF EXISTS purchase_bills_organization_software_bill_no_key;
DROP INDEX IF EXISTS purchase_bills_organization_software_bill_no_key;
CREATE UNIQUE INDEX purchase_bills_organization_software_bill_no_key 
ON purchase_bills (organization_id, software_bill_no) 
WHERE deleted_at IS NULL;

-- 3. Credit notes table - drop constraint first
ALTER TABLE credit_notes DROP CONSTRAINT IF EXISTS credit_notes_org_number_unique;
DROP INDEX IF EXISTS credit_notes_org_number_unique;
CREATE UNIQUE INDEX credit_notes_org_number_unique 
ON credit_notes (organization_id, credit_note_number) 
WHERE deleted_at IS NULL;

-- 4. Purchase returns table
ALTER TABLE purchase_returns DROP CONSTRAINT IF EXISTS purchase_returns_organization_return_number_key;
DROP INDEX IF EXISTS purchase_returns_organization_return_number_key;
CREATE UNIQUE INDEX purchase_returns_organization_return_number_key 
ON purchase_returns (organization_id, return_number) 
WHERE deleted_at IS NULL;

-- 5. Quotations table
ALTER TABLE quotations DROP CONSTRAINT IF EXISTS quotations_organization_quotation_number_key;
DROP INDEX IF EXISTS quotations_organization_quotation_number_key;
CREATE UNIQUE INDEX quotations_organization_quotation_number_key 
ON quotations (organization_id, quotation_number) 
WHERE deleted_at IS NULL;

-- 6. Sale orders table
ALTER TABLE sale_orders DROP CONSTRAINT IF EXISTS sale_orders_organization_order_number_key;
DROP INDEX IF EXISTS sale_orders_organization_order_number_key;
CREATE UNIQUE INDEX sale_orders_organization_order_number_key 
ON sale_orders (organization_id, order_number) 
WHERE deleted_at IS NULL;

-- 7. Sale returns table
ALTER TABLE sale_returns DROP CONSTRAINT IF EXISTS sale_returns_organization_return_number_key;
DROP INDEX IF EXISTS sale_returns_organization_return_number_key;
CREATE UNIQUE INDEX sale_returns_organization_return_number_key 
ON sale_returns (organization_id, return_number) 
WHERE deleted_at IS NULL;

-- Update generate_pos_number to filter out soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_pos_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT := 'POS';
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
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$function$;

-- Update generate_sale_number to filter out soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id uuid, p_prefix text DEFAULT 'INV'::text)
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
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM p_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE p_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  
  v_number := p_prefix || '/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$function$;

-- Update generate_purchase_bill_number to filter out soft-deleted records
CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT := 'PUR';
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
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(software_bill_no FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM purchase_bills
  WHERE organization_id = p_organization_id
    AND software_bill_no LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$function$;