-- Fix generate_purchase_bill_number to include soft-deleted records in sequence calculation
-- The unique constraint applies to ALL records, so we must include deleted records when finding MAX
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
  
  -- Get next sequence by finding MAX from ALL bills (including soft-deleted)
  -- because the unique constraint applies to all records
  SELECT COALESCE(MAX(CAST(SUBSTRING(software_bill_no FROM 'B\d{4}(\d+)$') AS INTEGER)), 0) + 1
  INTO v_sequence
  FROM purchase_bills
  WHERE software_bill_no LIKE 'B' || LPAD(v_month::TEXT, 2, '0') || LPAD(v_year::TEXT, 2, '0') || '%'
    AND organization_id = p_organization_id;
  
  v_bill_no := 'B' || 
               LPAD(v_month::TEXT, 2, '0') || 
               LPAD(v_year::TEXT, 2, '0') || 
               LPAD(v_sequence::TEXT, 3, '0');
  
  RETURN v_bill_no;
END;
$function$;