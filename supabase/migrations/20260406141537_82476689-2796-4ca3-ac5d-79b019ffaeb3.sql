
-- Create unified atomic sequence table
CREATE TABLE IF NOT EXISTS public.bill_number_sequences (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  series TEXT NOT NULL,
  last_number INTEGER NOT NULL DEFAULT 0,
  UNIQUE(organization_id, series)
);

ALTER TABLE public.bill_number_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_bill_sequences" ON public.bill_number_sequences
  FOR ALL TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Atomic POS number generator
CREATE OR REPLACE FUNCTION public.generate_pos_number_atomic(p_organization_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  ist_date DATE;
  fy_start INTEGER; fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date); fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date); fy_start := fy_end - 1;
  END IF;
  v_series := 'POS/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2) || '-'
                      || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN v_series || '/' || v_next::TEXT;
END; $$;

-- Atomic sale invoice number generator
CREATE OR REPLACE FUNCTION public.generate_sale_number_atomic(
  p_organization_id UUID, p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  ist_date DATE;
  fy_start INTEGER; fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date); fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date); fy_start := fy_end - 1;
  END IF;
  v_series := p_prefix || '/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2)
                               || '-' || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN v_series || '/' || v_next::TEXT;
END; $$;

-- Atomic purchase bill number generator
CREATE OR REPLACE FUNCTION public.generate_purchase_bill_number_atomic(p_organization_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  ist_date DATE;
  fy_start INTEGER; fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date); fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date); fy_start := fy_end - 1;
  END IF;
  v_series := 'PUR/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2)
                      || '-' || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  RETURN v_series || '/' || v_next::TEXT;
END; $$;

-- Replace original functions to use atomic versions (backward compatibility)
CREATE OR REPLACE FUNCTION public.generate_pos_number(p_organization_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN generate_pos_number_atomic(p_organization_id);
END; $$;

CREATE OR REPLACE FUNCTION public.generate_sale_number(p_organization_id UUID, p_prefix TEXT DEFAULT 'INV')
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $$
BEGIN
  RETURN generate_sale_number_atomic(p_organization_id, p_prefix);
END; $$;
