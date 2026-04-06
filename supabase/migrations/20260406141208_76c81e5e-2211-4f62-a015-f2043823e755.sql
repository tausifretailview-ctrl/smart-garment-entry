
-- Create atomic sequence table for sale invoice numbers (POS + INV)
CREATE TABLE IF NOT EXISTS public.sale_number_sequence (
  id SERIAL PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  prefix TEXT NOT NULL DEFAULT 'INV',
  financial_year TEXT NOT NULL,
  next_sequence INTEGER NOT NULL DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE (organization_id, prefix, financial_year)
);

ALTER TABLE public.sale_number_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage sale sequences for their org"
  ON public.sale_number_sequence
  FOR ALL
  TO authenticated
  USING (true)
  WITH CHECK (true);

-- Replace generate_pos_number with atomic version
CREATE OR REPLACE FUNCTION public.generate_pos_number(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq INTEGER;
  v_number TEXT;
  financial_year TEXT;
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
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Check custom series start from sale_settings
  v_min_seq := 1;
  BEGIN
    SELECT COALESCE(
      CAST(SUBSTRING((sale_settings->>'pos_series_start') FROM '/(\d+)$') AS INTEGER),
      1
    ) INTO v_min_seq
    FROM settings
    WHERE organization_id = p_organization_id
      AND sale_settings->>'pos_series_start' IS NOT NULL;
  EXCEPTION WHEN OTHERS THEN
    v_min_seq := 1;
  END;

  -- Atomic upsert: get-and-increment in one statement
  INSERT INTO public.sale_number_sequence (organization_id, prefix, financial_year, next_sequence, updated_at)
  VALUES (p_organization_id, 'POS', financial_year, GREATEST(v_min_seq, 1), now())
  ON CONFLICT (organization_id, prefix, financial_year)
  DO UPDATE SET
    next_sequence = GREATEST(sale_number_sequence.next_sequence, v_min_seq),
    updated_at = now()
  RETURNING next_sequence INTO v_seq;

  -- Now increment for next caller
  UPDATE public.sale_number_sequence
  SET next_sequence = v_seq + 1, updated_at = now()
  WHERE organization_id = p_organization_id AND prefix = 'POS' AND financial_year = financial_year;

  v_number := 'POS/' || financial_year || '/' || v_seq::TEXT;
  RETURN v_number;
END;
$$;

-- Replace generate_sale_number with atomic version
CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id UUID, p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT
LANGUAGE plpgsql
AS $$
DECLARE
  v_seq INTEGER;
  v_number TEXT;
  financial_year TEXT;
  ist_date DATE;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  v_min_seq INTEGER;
  v_series_key TEXT;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start_year := EXTRACT(YEAR FROM ist_date);
    fy_end_year := fy_start_year + 1;
  ELSE
    fy_end_year := EXTRACT(YEAR FROM ist_date);
    fy_start_year := fy_end_year - 1;
  END IF;
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Check custom series start
  v_min_seq := 1;
  IF p_prefix = 'INV' THEN
    v_series_key := 'invoice_series_start';
  ELSE
    v_series_key := NULL;
  END IF;

  IF v_series_key IS NOT NULL THEN
    BEGIN
      SELECT COALESCE(
        CAST(SUBSTRING((sale_settings->>v_series_key) FROM '/(\d+)$') AS INTEGER),
        1
      ) INTO v_min_seq
      FROM settings
      WHERE organization_id = p_organization_id
        AND sale_settings->>v_series_key IS NOT NULL;
    EXCEPTION WHEN OTHERS THEN
      v_min_seq := 1;
    END;
  END IF;

  -- Atomic upsert
  INSERT INTO public.sale_number_sequence (organization_id, prefix, financial_year, next_sequence, updated_at)
  VALUES (p_organization_id, p_prefix, financial_year, GREATEST(v_min_seq, 1), now())
  ON CONFLICT (organization_id, prefix, financial_year)
  DO UPDATE SET
    next_sequence = GREATEST(sale_number_sequence.next_sequence, v_min_seq),
    updated_at = now()
  RETURNING next_sequence INTO v_seq;

  -- Increment for next caller
  UPDATE public.sale_number_sequence
  SET next_sequence = v_seq + 1, updated_at = now()
  WHERE organization_id = p_organization_id AND prefix = p_prefix AND financial_year = financial_year;

  v_number := p_prefix || '/' || financial_year || '/' || v_seq::TEXT;
  RETURN v_number;
END;
$$;
