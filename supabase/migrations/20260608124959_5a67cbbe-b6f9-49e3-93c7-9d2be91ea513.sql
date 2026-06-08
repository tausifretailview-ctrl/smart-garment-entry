CREATE OR REPLACE FUNCTION public.generate_custom_sale_number(p_organization_id uuid, p_format text, p_year text, p_month text, p_min_sequence integer DEFAULT 1)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sequence integer;
  v_invoice_number text;
  v_like_pattern text;
  v_exists boolean;
BEGIN
  v_like_pattern := '%' || p_year || '%';

  PERFORM pg_advisory_xact_lock(hashtext('generate_custom_sale_number:' || p_organization_id::text));

  -- Include ALL rows (cancelled + soft-deleted) so we never collide with the unique constraint
  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(regexp_replace(sale_number, '[^0-9]', '', 'g'), '') AS integer
      )
    ), p_min_sequence - 1
  ) + 1
  INTO v_sequence
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_like_pattern;

  v_sequence := GREATEST(v_sequence, p_min_sequence);

  LOOP
    v_invoice_number := p_format;
    v_invoice_number := replace(v_invoice_number, '{YYYY}', p_year);
    v_invoice_number := replace(v_invoice_number, '{YY}', right(p_year, 2));
    v_invoice_number := replace(v_invoice_number, '{MM}', p_month);
    v_invoice_number := replace(v_invoice_number, '{#####}', lpad(v_sequence::text, 5, '0'));
    v_invoice_number := replace(v_invoice_number, '{####}', lpad(v_sequence::text, 4, '0'));
    v_invoice_number := replace(v_invoice_number, '{###}', lpad(v_sequence::text, 3, '0'));

    SELECT EXISTS(
      SELECT 1 FROM sales
      WHERE organization_id = p_organization_id
        AND sale_number = v_invoice_number
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_sequence := v_sequence + 1;
  END LOOP;

  RETURN v_invoice_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_custom_pos_number(p_organization_id uuid, p_format text, p_year text, p_month text, p_min_sequence integer DEFAULT 1)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sequence integer;
  v_invoice_number text;
  v_like_pattern text;
  v_exists boolean;
BEGIN
  v_like_pattern := '%' || p_year || '%';

  PERFORM pg_advisory_xact_lock(hashtext('generate_custom_pos_number:' || p_organization_id::text));

  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(regexp_replace(sale_number, '[^0-9]', '', 'g'), '') AS integer
      )
    ), p_min_sequence - 1
  ) + 1
  INTO v_sequence
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_like_pattern;

  v_sequence := GREATEST(v_sequence, p_min_sequence);

  LOOP
    v_invoice_number := p_format;
    v_invoice_number := replace(v_invoice_number, '{YYYY}', p_year);
    v_invoice_number := replace(v_invoice_number, '{YY}', right(p_year, 2));
    v_invoice_number := replace(v_invoice_number, '{MM}', p_month);
    v_invoice_number := replace(v_invoice_number, '{#####}', lpad(v_sequence::text, 5, '0'));
    v_invoice_number := replace(v_invoice_number, '{####}', lpad(v_sequence::text, 4, '0'));
    v_invoice_number := replace(v_invoice_number, '{###}', lpad(v_sequence::text, 3, '0'));

    SELECT EXISTS(
      SELECT 1 FROM sales
      WHERE organization_id = p_organization_id
        AND sale_number = v_invoice_number
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_sequence := v_sequence + 1;
  END LOOP;

  RETURN v_invoice_number;
END;
$function$;