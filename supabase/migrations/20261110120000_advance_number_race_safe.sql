-- Part 2.0: race-safe generate_advance_number + unique defence.
--
-- Decision (deliberate): keep EXISTING per-org series (p_organization_id filter).
-- Lock key: (organization_id, 'ADV', financial_year) — same dimensions as today's MAX.
--
-- Pattern (same as Part 1 vouchers / sale atomics):
--   1) LOCK table for cleanup + unique
--   2) Rename active duplicate (org, advance_number) groups (#d + short id)
--   3) UNIQUE (organization_id, advance_number)
--   4) RPC: pg_advisory_xact_lock + MAX+1 + EXISTS loop
--
-- customer_advances has no deleted_at — unique is on all rows.
-- Money rows are never deleted; extras are renamed only.

LOCK TABLE public.customer_advances IN EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1. Disambiguate duplicate (organization_id, advance_number) groups
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    organization_id,
    advance_number AS old_number,
    ROW_NUMBER() OVER (
      PARTITION BY organization_id, advance_number
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.customer_advances
  WHERE advance_number IS NOT NULL
    AND btrim(advance_number) <> ''
),
to_rename AS (
  SELECT
    id,
    organization_id,
    old_number,
    old_number || '#d' || replace(substr(id::text, 1, 8), '-', '') AS new_number
  FROM ranked
  WHERE rn > 1
)
UPDATE public.customer_advances ca
SET advance_number = tr.new_number
FROM to_rename tr
WHERE ca.id = tr.id;

-- ---------------------------------------------------------------------------
-- 2. Unique defence
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_customer_advances_org_number
  ON public.customer_advances (organization_id, advance_number);

COMMENT ON INDEX public.uq_customer_advances_org_number IS
  'Per-org unique advance_number. Pairs with race-safe generate_advance_number.';

-- ---------------------------------------------------------------------------
-- 3. Race-safe allocator (per-org series preserved)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_advance_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT := 'ADV';
  v_count INTEGER;
  v_number TEXT;
  financial_year TEXT;
  ist_date DATE;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  v_exists BOOLEAN;
  v_iter INTEGER := 0;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'generate_advance_number: organization_id is required';
  END IF;

  ist_date := (now() AT TIME ZONE 'Asia/Kolkata')::date;
  IF EXTRACT(MONTH FROM ist_date) >= 4 THEN
    fy_start_year := EXTRACT(YEAR FROM ist_date)::integer;
    fy_end_year := fy_start_year + 1;
  ELSE
    fy_end_year := EXTRACT(YEAR FROM ist_date)::integer;
    fy_start_year := fy_end_year - 1;
  END IF;

  financial_year :=
    SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2)
    || '-'
    || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Serialize allocators for this org + ADV + FY only (per-org series).
  PERFORM pg_advisory_xact_lock(
    hashtext(p_organization_id::text || ':ADV:' || financial_year)
  );

  SELECT COALESCE(
    MAX(CAST(SUBSTRING(advance_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)),
    0
  ) + 1
  INTO v_count
  FROM public.customer_advances
  WHERE organization_id = p_organization_id
    AND advance_number LIKE v_prefix || '/' || financial_year || '/%'
    AND advance_number !~ '#d';

  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 10000 THEN
      RAISE EXCEPTION
        'generate_advance_number exceeded 10000 iterations for org % / %',
        p_organization_id, financial_year;
    END IF;

    v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;

    SELECT EXISTS(
      SELECT 1
      FROM public.customer_advances
      WHERE organization_id = p_organization_id
        AND advance_number = v_number
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_number;
END;
$function$;

COMMENT ON FUNCTION public.generate_advance_number(uuid) IS
  'FY advance numbers ADV/YY-YY/N per organization. Race-safe via pg_advisory_xact_lock(org:ADV:FY) + EXISTS loop; unique index uq_customer_advances_org_number.';

-- Grants: match typical RPC grants on generate_* (authenticated / service_role).
GRANT EXECUTE ON FUNCTION public.generate_advance_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.generate_advance_number(uuid) TO service_role;
