-- Part 1: race-safe generate_voucher_number + unique defence.
--
-- Decision (deliberate): keep the EXISTING global series scope (no organization_id
-- filter). Adding per-org numbering would renumber future vouchers relative to
-- other tenants and must not be a silent side effect of the lock. Lock key is
-- therefore (prefix, financial_year) — same dimensions as today's MAX scan.
--
-- Pattern copied from generate_custom_sale_number / pos race-safe migrations:
--   1) pg_advisory_xact_lock
--   2) MAX+1 under the lock
--   3) EXISTS loop (belt)
--   4) UNIQUE partial index (suspenders) — requires cleaning active duplicates first.
--
-- Cleanup renames extras only (keeps oldest created_at, then id). Suffix "#d" +
-- short id does NOT match the trailing-(\d+)$ extractor, so it does not pollute
-- the MAX sequence. Money rows are never deleted.

-- Block concurrent INSERT/UPDATE while cleanup + unique index land.
LOCK TABLE public.voucher_entries IN EXCLUSIVE MODE;

-- ---------------------------------------------------------------------------
-- 1. Disambiguate active duplicate voucher_number groups
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    organization_id,
    voucher_number AS old_number,
    ROW_NUMBER() OVER (
      PARTITION BY voucher_number
      ORDER BY created_at NULLS LAST, id
    ) AS rn
  FROM public.voucher_entries
  WHERE deleted_at IS NULL
    AND voucher_number IS NOT NULL
    AND btrim(voucher_number) <> ''
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
UPDATE public.voucher_entries ve
SET
  voucher_number = tr.new_number,
  updated_at = now()
FROM to_rename tr
WHERE ve.id = tr.id;

-- Best-effort: keep mirrored numbers in sync for renamed rows only.
WITH renamed AS (
  SELECT
    id,
    organization_id,
    regexp_replace(voucher_number, '#d[0-9a-fA-F]+$', '') AS old_number,
    voucher_number AS new_number
  FROM public.voucher_entries
  WHERE deleted_at IS NULL
    AND voucher_number ~ '#d[0-9a-fA-F]+$'
)
UPDATE public.advance_refunds ar
SET refund_number = r.new_number
FROM renamed r
WHERE ar.refund_number = r.old_number
  AND ar.organization_id = r.organization_id
  AND (ar.voucher_entry_id IS NULL OR ar.voucher_entry_id = r.id);

-- Note: customer_ledger_entries.voucher_no is left unchanged when ambiguous
-- (two ledger lines can share the collided number in one org). Amounts are
-- unaffected; voucher_entries.id remains the money identity.

-- ---------------------------------------------------------------------------
-- 2. Unique defence (active rows only — soft-deleted may keep historical dups)
-- ---------------------------------------------------------------------------
CREATE UNIQUE INDEX IF NOT EXISTS uq_voucher_entries_number_active
  ON public.voucher_entries (voucher_number)
  WHERE deleted_at IS NULL;

COMMENT ON INDEX public.uq_voucher_entries_number_active IS
  'Second line of defence for generate_voucher_number races. Series is global (all orgs); matches historical allocator scope.';

-- ---------------------------------------------------------------------------
-- 3. Race-safe allocator (global series preserved)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.generate_voucher_number(p_type text, p_date date DEFAULT CURRENT_DATE)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prefix TEXT;
  v_count INTEGER;
  v_number TEXT;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  v_exists BOOLEAN;
  v_iter INTEGER := 0;
BEGIN
  v_prefix := CASE p_type
    WHEN 'payment' THEN 'PAY'
    WHEN 'receipt' THEN 'RCP'
    WHEN 'expense' THEN 'EXP'
    WHEN 'journal' THEN 'JV'
    WHEN 'contra' THEN 'CNT'
    WHEN 'cn_refund' THEN 'RF'
    WHEN 'advance_refund' THEN 'ARF'
    ELSE 'VCH'
  END;

  current_month := EXTRACT(MONTH FROM p_date);
  current_year := EXTRACT(YEAR FROM p_date);

  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;

  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);

  -- Serialize all allocators for this prefix+FY across every org (current global series).
  PERFORM pg_advisory_xact_lock(hashtext('voucher:' || v_prefix || ':' || financial_year));

  IF p_type IN ('cn_refund', 'advance_refund') THEN
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)),
      0
    ) + 1
    INTO v_count
    FROM public.voucher_entries
    WHERE voucher_number LIKE v_prefix || '/' || financial_year || '/%'
      AND deleted_at IS NULL
      AND voucher_number !~ '#d';
  ELSE
    SELECT COALESCE(
      MAX(CAST(SUBSTRING(voucher_number FROM v_prefix || '/\d+-\d+/(\d+)$') AS INTEGER)),
      0
    ) + 1
    INTO v_count
    FROM public.voucher_entries
    WHERE voucher_type = p_type
      AND voucher_number LIKE v_prefix || '/' || financial_year || '/%'
      AND deleted_at IS NULL
      AND voucher_number !~ '#d';
  END IF;

  LOOP
    v_iter := v_iter + 1;
    IF v_iter > 10000 THEN
      RAISE EXCEPTION 'generate_voucher_number exceeded 10000 iterations for %/%', v_prefix, financial_year;
    END IF;

    v_number := v_prefix || '/' || financial_year || '/' || v_count::TEXT;

    SELECT EXISTS(
      SELECT 1
      FROM public.voucher_entries
      WHERE voucher_number = v_number
        AND deleted_at IS NULL
    ) INTO v_exists;

    EXIT WHEN NOT v_exists;
    v_count := v_count + 1;
  END LOOP;

  RETURN v_number;
END;
$function$;

COMMENT ON FUNCTION public.generate_voucher_number(text, date) IS
  'FY voucher numbers (RCP/PAY/EXP/JV/CNT/RF/ARF). Global series (all orgs). Race-safe via pg_advisory_xact_lock(prefix:FY) + EXISTS loop; unique index uq_voucher_entries_number_active.';
