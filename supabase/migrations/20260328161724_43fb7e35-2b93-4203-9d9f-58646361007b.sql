
-- Update all billing number generators to use YYYY-YY financial year format
-- e.g. INV/2026-27/1 instead of INV/26-27/1

CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id uuid, p_prefix text DEFAULT 'INV')
RETURNS text LANGUAGE plpgsql AS $$
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
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
RETURNS text LANGUAGE plpgsql AS $$
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_voucher_number(p_type text, p_date date DEFAULT CURRENT_DATE)
RETURNS text LANGUAGE plpgsql AS $$
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
  v_prefix := CASE p_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'receipt' THEN 'RCP'
    WHEN 'expense' THEN 'EXP'
    WHEN 'journal' THEN 'JV'
    WHEN 'contra' THEN 'CNT'
    ELSE 'VCH'
  END;
  current_month := EXTRACT(MONTH FROM p_date);
  current_year := EXTRACT(YEAR FROM p_date);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM voucher_entries
  WHERE voucher_type = p_type
    AND voucher_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_quotation_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'QT';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(quotation_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM quotations
  WHERE organization_id = p_organization_id
    AND quotation_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sale_order_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'SO';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sale_orders
  WHERE organization_id = p_organization_id
    AND order_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sale_return_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'SR';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM sale_returns
  WHERE organization_id = p_organization_id
    AND return_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_credit_note_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'CN';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(credit_note_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM credit_notes
  WHERE organization_id = p_organization_id
    AND credit_note_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_return_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'PR';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(return_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM purchase_returns
  WHERE organization_id = p_organization_id
    AND return_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
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

CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number(p_date date DEFAULT CURRENT_DATE, p_organization_id uuid DEFAULT NULL)
RETURNS text LANGUAGE plpgsql AS $$
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
  current_month := EXTRACT(MONTH FROM p_date);
  current_year := EXTRACT(YEAR FROM p_date);
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
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

CREATE OR REPLACE FUNCTION public.generate_challan_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'DC';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(challan_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM delivery_challans
  WHERE organization_id = p_organization_id
    AND challan_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_advance_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'ADV';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(advance_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM customer_advances
  WHERE organization_id = p_organization_id
    AND advance_number LIKE v_prefix || '/' || financial_year || '/%';
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_purchase_order_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'PO';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(order_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM purchase_orders
  WHERE organization_id = p_organization_id
    AND order_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_fee_receipt_number(p_organization_id uuid)
RETURNS text LANGUAGE plpgsql AS $$
DECLARE
  v_prefix TEXT := 'FR';
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
  financial_year := fy_start_year::TEXT || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  SELECT COALESCE(MAX(CAST(SUBSTRING(receipt_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO v_count
  FROM fee_receipts
  WHERE organization_id = p_organization_id
    AND receipt_number LIKE v_prefix || '/' || financial_year || '/%';
  v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;
  RETURN v_number;
END;
$$;
