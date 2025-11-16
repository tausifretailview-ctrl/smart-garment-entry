-- Add software_bill_no column to purchase_bills table
ALTER TABLE purchase_bills ADD COLUMN software_bill_no TEXT;

-- Create function to generate sequential purchase bill numbers
CREATE OR REPLACE FUNCTION generate_purchase_bill_number()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  next_number INTEGER;
  bill_num TEXT;
BEGIN
  -- Get the next number by finding the max existing number
  SELECT COALESCE(MAX(CAST(SUBSTRING(software_bill_no FROM '\d+$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.purchase_bills
  WHERE software_bill_no IS NOT NULL;
  
  bill_num := 'PB-' || LPAD(next_number::TEXT, 6, '0');
  
  RETURN bill_num;
END;
$$;