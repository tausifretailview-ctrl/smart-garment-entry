-- Fix generate_custom_sale_number / generate_custom_pos_number regressions from
-- 20260811120000 that caused large INV/POS series jumps:
--   1) LIKE '%'||calendar_year||'%' never matched INV/26-27/N (FY prefix)
--   2) MAX(regexp_replace(sale_number, '[^0-9]', '', 'g')) concatenated FY digits
--      (INV/26-27/18 → 262718) instead of trailing sequence
--   3) EXISTS / MAX ignored deleted_at, so soft-deleted trials blocked reuse
-- Restore format-based LIKE + trailing sequence + active-only matching.

CREATE OR REPLACE FUNCTION public.generate_custom_sale_number(
  p_organization_id uuid,
  p_format text,
  p_year text,
  p_month text,
  p_min_sequence integer DEFAULT 1
)
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
  v_iter integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text || ':sale'));

  IF p_format !~ '\{#+\}' THEN
    RAISE EXCEPTION 'Sale invoice numbering format "%" is missing a sequence placeholder like {###}. Please update Sale Settings → Invoice Numbering Format.', p_format
      USING ERRCODE = '22023';
  END IF;

  v_like_pattern := p_format;
  v_like_pattern := regexp_replace(v_like_pattern, '\{#+\}', '%');
  v_like_pattern := replace(v_like_pattern, '{YYYY}', '%');
  v_like_pattern := replace(v_like_pattern, '{YY}', '%');
  v_like_pattern := replace(v_like_pattern, '{MM}', '%');

  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(substring(sale_number from '/([0-9]+)$'), '') AS integer
      )
    ),
    p_min_sequence - 1
  ) + 1
  INTO v_sequence
  FROM sales
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND sale_number LIKE v_like_pattern;

  v_sequence := GREATEST(v_sequence, p_min_sequence);

  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 10000 THEN
      RAISE EXCEPTION 'generate_custom_sale_number exceeded 10000 iterations for org % (format %).', p_organization_id, p_format;
    END IF;

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
        AND deleted_at IS NULL
        AND sale_number = v_invoice_number
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_sequence := v_sequence + 1;
  END LOOP;

  RETURN v_invoice_number;
END;
$function$;

CREATE OR REPLACE FUNCTION public.generate_custom_pos_number(
  p_organization_id uuid,
  p_format text,
  p_year text,
  p_month text,
  p_min_sequence integer DEFAULT 1
)
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
  v_iter integer := 0;
BEGIN
  PERFORM pg_advisory_xact_lock(hashtext(p_organization_id::text || ':pos'));

  IF p_format !~ '\{#+\}' THEN
    RAISE EXCEPTION 'POS numbering format "%" is missing a sequence placeholder like {###}. Please update Sale Settings → POS Numbering Format.', p_format
      USING ERRCODE = '22023';
  END IF;

  v_like_pattern := p_format;
  v_like_pattern := regexp_replace(v_like_pattern, '\{#+\}', '%');
  v_like_pattern := replace(v_like_pattern, '{YYYY}', '%');
  v_like_pattern := replace(v_like_pattern, '{YY}', '%');
  v_like_pattern := replace(v_like_pattern, '{MM}', '%');

  SELECT COALESCE(
    MAX(
      CAST(
        NULLIF(substring(sale_number from '/([0-9]+)$'), '') AS integer
      )
    ),
    p_min_sequence - 1
  ) + 1
  INTO v_sequence
  FROM sales
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND sale_number LIKE v_like_pattern;

  v_sequence := GREATEST(v_sequence, p_min_sequence);

  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 10000 THEN
      RAISE EXCEPTION 'generate_custom_pos_number exceeded 10000 iterations for org % (format %).', p_organization_id, p_format;
    END IF;

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
        AND deleted_at IS NULL
        AND sale_number = v_invoice_number
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_sequence := v_sequence + 1;
  END LOOP;

  RETURN v_invoice_number;
END;
$function$;

COMMENT ON FUNCTION public.generate_custom_sale_number(uuid, text, text, text, integer) IS
  'Race-safe custom INV number. Uses trailing sequence after last slash; ignores soft-deleted sales; LIKE pattern from format.';

COMMENT ON FUNCTION public.generate_custom_pos_number(uuid, text, text, text, integer) IS
  'Race-safe custom POS number. Uses trailing sequence after last slash; ignores soft-deleted sales; LIKE pattern from format.';

GRANT EXECUTE ON FUNCTION public.generate_custom_sale_number(uuid, text, text, text, integer) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_custom_pos_number(uuid, text, text, text, integer) TO authenticated;
