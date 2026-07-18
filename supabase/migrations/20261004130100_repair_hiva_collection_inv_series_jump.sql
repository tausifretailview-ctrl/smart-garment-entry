-- Hiva Collection: sale invoice series jumped INV/26-27/018 → INV/26-27/262
-- while only ~16 active invoices existed. Renumber the jumped bills back into
-- sequence (262→19, 263→20, …) and sync bill_number_sequences + series_start.

DO $$
DECLARE
  v_org_id uuid;
  v_org_name text;
  v_pre_gap_max integer;
  v_jumped_count integer;
  v_next integer;
  r record;
  v_new text;
  v_temp text;
  v_series_start text;
  v_series_seq integer;
  v_final_max integer;
BEGIN
  SELECT id, name
  INTO v_org_id, v_org_name
  FROM public.organizations
  WHERE name ILIKE '%hiva%collection%'
     OR name ILIKE 'hiva collection'
     OR slug ILIKE '%hiva%'
  ORDER BY
    CASE WHEN name ILIKE 'hiva collection' THEN 0 ELSE 1 END,
    created_at
  LIMIT 1;

  IF v_org_id IS NULL THEN
    RAISE NOTICE 'repair_hiva_inv: no Hiva Collection organization found — skipping';
    RETURN;
  END IF;

  -- Only repair when the characteristic jump is present (active /262 with low max before gap).
  IF NOT EXISTS (
    SELECT 1 FROM public.sales
    WHERE organization_id = v_org_id
      AND sale_number = 'INV/26-27/262'
      AND deleted_at IS NULL
  ) THEN
    RAISE NOTICE 'repair_hiva_inv: org % (%) has no active INV/26-27/262 — skipping', v_org_id, v_org_name;
    RETURN;
  END IF;

  SELECT COALESCE(
    MAX(CAST(substring(sale_number from '/([0-9]+)$') AS integer)),
    0
  )
  INTO v_pre_gap_max
  FROM public.sales
  WHERE organization_id = v_org_id
    AND deleted_at IS NULL
    AND sale_number LIKE 'INV/26-27/%'
    AND CAST(substring(sale_number from '/([0-9]+)$') AS integer) < 200;

  IF v_pre_gap_max IS NULL OR v_pre_gap_max < 1 OR v_pre_gap_max > 50 THEN
    RAISE NOTICE 'repair_hiva_inv: unexpected pre-gap max % for org % — skipping for safety',
      v_pre_gap_max, v_org_name;
    RETURN;
  END IF;

  SELECT COUNT(*)::integer
  INTO v_jumped_count
  FROM public.sales
  WHERE organization_id = v_org_id
    AND deleted_at IS NULL
    AND sale_number LIKE 'INV/26-27/%'
    AND CAST(substring(sale_number from '/([0-9]+)$') AS integer) >= 200;

  IF v_jumped_count < 1 OR v_jumped_count > 20 THEN
    RAISE NOTICE 'repair_hiva_inv: jumped count % outside safe window — skipping', v_jumped_count;
    RETURN;
  END IF;

  RAISE NOTICE 'repair_hiva_inv: org % (%) pre-gap max=% jumped=% — renumbering',
    v_org_id, v_org_name, v_pre_gap_max, v_jumped_count;

  -- Pass 1: move jumped numbers to temporary unique placeholders (avoid unique index clashes).
  -- Also rewrite voucher descriptions that embed the old sale_number before it disappears.
  FOR r IN
    SELECT id, sale_number
    FROM public.sales
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL
      AND sale_number LIKE 'INV/26-27/%'
      AND CAST(substring(sale_number from '/([0-9]+)$') AS integer) >= 200
    ORDER BY sale_date ASC NULLS LAST, created_at ASC NULLS LAST, sale_number ASC
  LOOP
    v_temp := 'INV/26-27/TMP-' || replace(r.id::text, '-', '');

    UPDATE public.voucher_entries
    SET description = replace(description, r.sale_number, v_temp)
    WHERE organization_id = v_org_id
      AND reference_id = r.id
      AND description IS NOT NULL
      AND description LIKE '%' || r.sale_number || '%';

    UPDATE public.sales
    SET sale_number = v_temp
    WHERE id = r.id
      AND organization_id = v_org_id;
  END LOOP;

  -- Pass 2: assign contiguous numbers after pre-gap max.
  v_next := v_pre_gap_max + 1;
  FOR r IN
    SELECT id, sale_number
    FROM public.sales
    WHERE organization_id = v_org_id
      AND deleted_at IS NULL
      AND sale_number LIKE 'INV/26-27/TMP-%'
    ORDER BY sale_date ASC NULLS LAST, created_at ASC NULLS LAST, sale_number ASC
  LOOP
    v_new := 'INV/26-27/' || v_next::text;

    UPDATE public.voucher_entries
    SET description = replace(description, r.sale_number, v_new)
    WHERE organization_id = v_org_id
      AND reference_id = r.id
      AND description IS NOT NULL
      AND description LIKE '%' || r.sale_number || '%';

    UPDATE public.sales
    SET sale_number = v_new
    WHERE id = r.id
      AND organization_id = v_org_id;

    RAISE NOTICE 'repair_hiva_inv: % → %', r.sale_number, v_new;
    v_next := v_next + 1;
  END LOOP;

  SELECT COALESCE(
    MAX(CAST(substring(sale_number from '/([0-9]+)$') AS integer)),
    0
  )
  INTO v_final_max
  FROM public.sales
  WHERE organization_id = v_org_id
    AND deleted_at IS NULL
    AND sale_number LIKE 'INV/26-27/%'
    AND sale_number !~ 'TMP-';

  INSERT INTO public.bill_number_sequences (organization_id, series, last_number)
  VALUES (v_org_id, 'INV/26-27', v_final_max)
  ON CONFLICT (organization_id, series)
  DO UPDATE SET last_number = EXCLUDED.last_number;

  -- If Sale Settings "Series Start From" is stuck at/above the jumped floor, snap it back.
  SELECT sale_settings->>'invoice_series_start'
  INTO v_series_start
  FROM public.settings
  WHERE organization_id = v_org_id
  LIMIT 1;

  IF v_series_start IS NOT NULL AND btrim(v_series_start) <> '' THEN
    v_series_seq := NULLIF(substring(v_series_start from '([0-9]+)$'), '')::integer;
    IF v_series_seq IS NOT NULL AND v_series_seq >= 200 THEN
      UPDATE public.settings
      SET sale_settings = jsonb_set(
        COALESCE(sale_settings, '{}'::jsonb),
        '{invoice_series_start}',
        to_jsonb('INV/26-27/' || v_final_max::text)
      )
      WHERE organization_id = v_org_id;
      RAISE NOTICE 'repair_hiva_inv: invoice_series_start % → INV/26-27/%',
        v_series_start, v_final_max;
    END IF;
  END IF;

  RAISE NOTICE 'repair_hiva_inv: done — next INV will be INV/26-27/%', v_final_max + 1;
END $$;
