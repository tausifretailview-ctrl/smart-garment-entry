
-- Fix generate_pos_number: truly atomic single-statement
CREATE OR REPLACE FUNCTION public.generate_pos_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq INTEGER;
  v_number TEXT;
  v_fy TEXT;
  ist_date DATE;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  v_min_seq INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start_year := EXTRACT(YEAR FROM ist_date);
    fy_end_year := fy_start_year + 1;
  ELSE
    fy_end_year := EXTRACT(YEAR FROM ist_date);
    fy_start_year := fy_end_year - 1;
  END IF;
  v_fy := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  v_min_seq := 1;
  BEGIN
    SELECT COALESCE(
      CAST(SUBSTRING((sale_settings->>'pos_series_start') FROM '/(\d+)$') AS INTEGER), 1
    ) INTO v_min_seq
    FROM public.settings
    WHERE organization_id = p_organization_id
      AND sale_settings->>'pos_series_start' IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    v_min_seq := 1;
  END;

  -- Atomic: insert-or-increment and return in one statement
  INSERT INTO public.sale_number_sequence (organization_id, prefix, financial_year, next_sequence, updated_at)
  VALUES (p_organization_id, 'POS', v_fy, GREATEST(v_min_seq, 1) + 1, now())
  ON CONFLICT (organization_id, prefix, financial_year)
  DO UPDATE SET
    next_sequence = GREATEST(public.sale_number_sequence.next_sequence, v_min_seq) + 1,
    updated_at = now()
  RETURNING next_sequence - 1 INTO v_seq;

  v_number := 'POS/' || v_fy || '/' || v_seq::TEXT;
  RETURN v_number;
END;
$$;

-- Fix generate_sale_number: truly atomic single-statement
CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id UUID, p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq INTEGER;
  v_number TEXT;
  v_fy TEXT;
  ist_date DATE;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  v_min_seq INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start_year := EXTRACT(YEAR FROM ist_date);
    fy_end_year := fy_start_year + 1;
  ELSE
    fy_end_year := EXTRACT(YEAR FROM ist_date);
    fy_start_year := fy_end_year - 1;
  END IF;
  v_fy := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  v_min_seq := 1;
  IF p_prefix = 'INV' THEN
    BEGIN
      SELECT COALESCE(
        CAST(SUBSTRING((sale_settings->>'invoice_series_start') FROM '/(\d+)$') AS INTEGER), 1
      ) INTO v_min_seq
      FROM public.settings
      WHERE organization_id = p_organization_id
        AND sale_settings->>'invoice_series_start' IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      v_min_seq := 1;
    END;
  END IF;

  -- Atomic: insert-or-increment and return in one statement
  INSERT INTO public.sale_number_sequence (organization_id, prefix, financial_year, next_sequence, updated_at)
  VALUES (p_organization_id, p_prefix, v_fy, GREATEST(v_min_seq, 1) + 1, now())
  ON CONFLICT (organization_id, prefix, financial_year)
  DO UPDATE SET
    next_sequence = GREATEST(public.sale_number_sequence.next_sequence, v_min_seq) + 1,
    updated_at = now()
  RETURNING next_sequence - 1 INTO v_seq;

  v_number := p_prefix || '/' || v_fy || '/' || v_seq::TEXT;
  RETURN v_number;
END;
$$;
