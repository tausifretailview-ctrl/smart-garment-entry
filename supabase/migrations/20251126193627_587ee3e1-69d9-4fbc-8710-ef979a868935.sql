-- Add return_number column to sale_returns table
ALTER TABLE sale_returns ADD COLUMN IF NOT EXISTS return_number TEXT;

-- Create function to generate POS numbers (POS/YY-YY/N)
CREATE OR REPLACE FUNCTION generate_pos_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  pos_num TEXT;
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
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 'POS/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM sales
  WHERE sale_number LIKE 'POS/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  -- Format: POS/YY-YY/N (e.g., POS/25-26/1)
  pos_num := 'POS/' || financial_year || '/' || next_number::TEXT;
  
  RETURN pos_num;
END;
$$;

-- Create function to generate Sale Return numbers (SR/YY-YY/N)
CREATE OR REPLACE FUNCTION generate_sale_return_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM 'SR/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM sale_returns
  WHERE return_number LIKE 'SR/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  -- Format: SR/YY-YY/N (e.g., SR/25-26/1)
  return_num := 'SR/' || financial_year || '/' || next_number::TEXT;
  
  RETURN return_num;
END;
$$;

-- Update generate_voucher_number function to use financial year format
CREATE OR REPLACE FUNCTION generate_voucher_number(p_type TEXT, p_date DATE DEFAULT CURRENT_DATE)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  
  -- Get count for this financial year
  SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM voucher_entries
  WHERE voucher_type = p_type
    AND voucher_number LIKE v_prefix || '/' || financial_year || '/%';
  
  -- Format: PREFIX/YY-YY/N (e.g., RCP/25-26/1)
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  
  RETURN v_number;
END;
$$;