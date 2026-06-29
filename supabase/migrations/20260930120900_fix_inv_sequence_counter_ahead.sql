-- Phase 1: INV/26-27 sequence reset for org with active INV/26-27/87 (deleted 88–96 consumed counter).
-- Also: bidirectional self-heal on generate_*_number_atomic so counter cannot stay ahead of active MAX.

-- ── Org-scoped one-time counter sync (Branch A) ─────────────────────────────
DO $$
DECLARE
  v_org_id uuid;
  v_max_seq integer;
  v_rows integer;
BEGIN
  SELECT organization_id
  INTO v_org_id
  FROM public.sales
  WHERE sale_number = 'INV/26-27/87'
    AND deleted_at IS NULL
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'fix_inv_sequence: no active INV/26-27/87 found — skipping org counter reset';
    RETURN;
  END IF;

  SELECT COALESCE(
    MAX(CAST(regexp_replace(sale_number, '.*/', '') AS INTEGER)),
    0
  )
  INTO v_max_seq
  FROM public.sales
  WHERE organization_id = v_org_id
    AND sale_number LIKE 'INV/26-27/%'
    AND deleted_at IS NULL;

  INSERT INTO public.bill_number_sequences (organization_id, series, last_number)
  VALUES (v_org_id, 'INV/26-27', v_max_seq)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = EXCLUDED.last_number;

  GET DIAGNOSTICS v_rows = ROW_COUNT;
  RAISE NOTICE 'fix_inv_sequence: org % INV/26-27 last_number set to % (next = INV/26-27/%)',
    v_org_id, v_max_seq, v_max_seq + 1;
END $$;

-- ── Bidirectional self-heal (counter behind OR ahead of active sales MAX) ───
CREATE OR REPLACE FUNCTION public.generate_pos_number_atomic(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  v_actual_max INTEGER;
  v_target INTEGER;
  ist_date DATE;
  fy_start INTEGER;
  fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date);
    fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date);
    fy_start := fy_end - 1;
  END IF;
  v_series := 'POS/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2) || '-'
                      || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  SELECT COALESCE(MAX(CAST(regexp_replace(sale_number, '.*/', '') AS INTEGER)), 0)
  INTO v_actual_max
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_series || '/%'
    AND deleted_at IS NULL;

  v_target := v_actual_max + 1;

  IF v_next <> v_target THEN
    v_next := v_target;
    UPDATE bill_number_sequences
    SET last_number = v_next
    WHERE organization_id = p_organization_id
      AND series = v_series;
  END IF;

  RETURN v_series || '/' || v_next::TEXT;
END;
$$;

CREATE OR REPLACE FUNCTION public.generate_sale_number_atomic(
  p_organization_id UUID,
  p_prefix TEXT DEFAULT 'INV'
)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_series TEXT;
  v_next INTEGER;
  v_actual_max INTEGER;
  v_target INTEGER;
  ist_date DATE;
  fy_start INTEGER;
  fy_end INTEGER;
BEGIN
  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start := EXTRACT(YEAR FROM ist_date);
    fy_end := fy_start + 1;
  ELSE
    fy_end := EXTRACT(YEAR FROM ist_date);
    fy_start := fy_end - 1;
  END IF;
  v_series := p_prefix || '/' || SUBSTRING(fy_start::TEXT FROM 3 FOR 2)
                               || '-' || SUBSTRING(fy_end::TEXT FROM 3 FOR 2);

  INSERT INTO bill_number_sequences (organization_id, series, last_number)
  VALUES (p_organization_id, v_series, 1)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = bill_number_sequences.last_number + 1
  RETURNING last_number INTO v_next;

  SELECT COALESCE(MAX(CAST(regexp_replace(sale_number, '.*/', '') AS INTEGER)), 0)
  INTO v_actual_max
  FROM sales
  WHERE organization_id = p_organization_id
    AND sale_number LIKE v_series || '/%'
    AND deleted_at IS NULL;

  v_target := v_actual_max + 1;

  IF v_next <> v_target THEN
    v_next := v_target;
    UPDATE bill_number_sequences
    SET last_number = v_next
    WHERE organization_id = p_organization_id
      AND series = v_series;
  END IF;

  RETURN v_series || '/' || v_next::TEXT;
END;
$$;

COMMENT ON FUNCTION public.generate_sale_number_atomic(uuid, text) IS
  'Atomic INV (or prefix) sale number. Self-heals bill_number_sequences to MAX(active sales)+1 when counter is behind OR ahead (e.g. soft-deleted invoices consumed numbers).';

COMMENT ON FUNCTION public.generate_pos_number_atomic(uuid) IS
  'Atomic POS sale number. Self-heals bill_number_sequences to MAX(active sales)+1 when counter is behind OR ahead.';
