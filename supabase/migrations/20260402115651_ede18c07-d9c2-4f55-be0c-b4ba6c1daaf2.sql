
-- Create dedicated sequence counter table for fee receipts
CREATE TABLE IF NOT EXISTS public.fee_receipt_sequence (
  id            SERIAL PRIMARY KEY,
  organization_id uuid NOT NULL,
  financial_year  text NOT NULL,
  next_sequence   integer NOT NULL DEFAULT 1,
  updated_at      timestamptz DEFAULT now(),
  UNIQUE (organization_id, financial_year)
);

ALTER TABLE fee_receipt_sequence ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_fee_receipt_sequence_all" ON fee_receipt_sequence
  FOR ALL USING (true) WITH CHECK (true);

-- Replace the function with atomic version using INSERT ON CONFLICT
CREATE OR REPLACE FUNCTION public.generate_fee_receipt_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_sequence      INTEGER;
  v_number        TEXT;
  financial_year  TEXT;
  current_month   INTEGER;
  current_year    INTEGER;
  fy_start_year   INTEGER;
  fy_end_year     INTEGER;
BEGIN
  current_month := EXTRACT(MONTH FROM (now() AT TIME ZONE 'Asia/Kolkata')::date);
  current_year  := EXTRACT(YEAR FROM (now() AT TIME ZONE 'Asia/Kolkata')::date);

  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year   := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year   := current_year;
  END IF;

  financial_year :=
    fy_start_year::TEXT || '-' ||
    SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  INSERT INTO public.fee_receipt_sequence (organization_id, financial_year, next_sequence)
  VALUES (p_organization_id, financial_year, 1)
  ON CONFLICT (organization_id, financial_year)
  DO UPDATE SET
    next_sequence = fee_receipt_sequence.next_sequence + 1,
    updated_at    = now()
  RETURNING next_sequence INTO v_sequence;

  v_number := 'RCT/' || financial_year || '/' || v_sequence::TEXT;

  RETURN v_number;
END;
$$;
