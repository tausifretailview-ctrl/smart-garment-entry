
-- Fix Financial Year Roll-over for all billing number generators
-- April 2026+ → 26-27 series

CREATE OR REPLACE FUNCTION public.generate_sale_number(
  p_organization_id uuid,
  p_prefix text DEFAULT 'INV'::text
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
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
$$;

CREATE OR REPLACE FUNCTION public.generate_pos_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM 'POS/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE 'POS/' || financial_year || '/%'
    AND deleted_at IS NULL;

  v_number := 'POS/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
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
$$;

CREATE OR REPLACE FUNCTION public.generate_sale_return_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM 'SR/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sale_returns
  WHERE organization_id = p_organization_id
    AND return_number LIKE 'SR/' || financial_year || '/%'
    AND deleted_at IS NULL;

  v_number := 'SR/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sale_order_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM 'SO/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sale_orders
  WHERE organization_id = p_organization_id
    AND order_number LIKE 'SO/' || financial_year || '/%';

  v_number := 'SO/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_return_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM 'PR/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM purchase_returns
  WHERE organization_id = p_organization_id
    AND return_number LIKE 'PR/' || financial_year || '/%';

  v_number := 'PR/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_delivery_challan_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(challan_number FROM 'DC/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM delivery_challans
  WHERE organization_id = p_organization_id
    AND challan_number LIKE 'DC/' || financial_year || '/%'
    AND deleted_at IS NULL;

  v_number := 'DC/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM 'QT/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM quotations
  WHERE organization_id = p_organization_id
    AND quotation_number LIKE 'QT/' || financial_year || '/%';

  v_number := 'QT/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_credit_note_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(credit_note_number FROM 'CN/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM credit_notes
  WHERE organization_id = p_organization_id
    AND credit_note_number LIKE 'CN/' || financial_year || '/%'
    AND deleted_at IS NULL;

  v_number := 'CN/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_advance_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(advance_number FROM 'ADV/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM customer_advances
  WHERE organization_id = p_organization_id
    AND advance_number LIKE 'ADV/' || financial_year || '/%';

  v_number := 'ADV/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_receipt_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
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
  current_year  := EXTRACT(YEAR  FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM 'RCT/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM customer_payments
  WHERE organization_id = p_organization_id
    AND receipt_number LIKE 'RCT/' || financial_year || '/%';

  v_number := 'RCT/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;
