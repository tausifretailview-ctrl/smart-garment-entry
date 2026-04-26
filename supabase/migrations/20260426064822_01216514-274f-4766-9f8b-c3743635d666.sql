CREATE OR REPLACE FUNCTION public.generate_challan_number(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SET search_path TO 'public', 'pg_temp'
AS $function$
DECLARE
  v_prefix TEXT := 'DC';
  v_count INTEGER;
  v_count_dc INTEGER;
  v_count_sales INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  IF current_month >= 4 THEN
    fy_start_year := current_year; fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1; fy_end_year := current_year;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  SELECT COALESCE(MAX(CAST(SUBSTRING(challan_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0)
    INTO v_count_dc
  FROM delivery_challans
  WHERE organization_id = p_organization_id
    AND challan_number LIKE v_prefix || '/' || financial_year || '/%'
    AND deleted_at IS NULL;

  -- Also check sales table because POS DCs are persisted there with sale_type='delivery_challan'
  SELECT COALESCE(MAX(CAST(SUBSTRING(sale_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)), 0)
    INTO v_count_sales
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_prefix || '/' || financial_year || '/%';

  v_count := GREATEST(v_count_dc, v_count_sales) + 1;

  RETURN v_prefix || '/' || financial_year || '/' || v_count::TEXT;
END;
$function$;