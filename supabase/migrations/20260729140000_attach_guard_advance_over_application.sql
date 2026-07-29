-- =============================================================================
-- APPROVAL REQUIRED — do not apply until reviewed.
--
-- Attach / (re)define guard_advance_over_application on voucher_entries.
--
-- Checkout note (2026-07-29): this function name does NOT appear in any prior
-- migration in this repo. Live DB may already have a copy; CREATE OR REPLACE
-- makes the body authoritative. Intended behaviour:
--   * BEFORE INSERT (and UPDATE that keeps the row live) on voucher_entries
--   * Only for voucher_type = 'receipt' AND payment_method = 'advance_adjustment'
--   * Compares (existing live advance_adjustment Σ + NEW.total_amount)
--     against sales.net_amount (+ ₹1 tolerance)
--   * On violation: RAISE EXCEPTION (blocks the write) — never silently skip
--
-- Why not paid_amount: paid_amount is cash-like tender and is capped at
-- net_amount, so it cannot detect advance over-application (INV/362 symptom).
-- =============================================================================

CREATE OR REPLACE FUNCTION public.guard_advance_over_application()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_net NUMERIC;
  v_existing NUMERIC;
  v_incoming NUMERIC;
BEGIN
  -- Soft-delete / non-advance rows: no-op
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF LOWER(COALESCE(NEW.voucher_type, '')) IS DISTINCT FROM 'receipt' THEN
    RETURN NEW;
  END IF;

  IF LOWER(COALESCE(NEW.payment_method, '')) IS DISTINCT FROM 'advance_adjustment' THEN
    RETURN NEW;
  END IF;

  IF NEW.reference_id IS NULL OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  v_incoming := COALESCE(NEW.total_amount, 0);
  IF v_incoming <= 0 THEN
    RETURN NEW;
  END IF;

  SELECT s.net_amount
  INTO v_net
  FROM public.sales s
  WHERE s.id = NEW.reference_id
    AND s.organization_id = NEW.organization_id
    AND s.deleted_at IS NULL;

  IF NOT FOUND THEN
    -- Orphan / non-sale reference: do not invent policy here
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ve.total_amount), 0)
  INTO v_existing
  FROM public.voucher_entries ve
  WHERE ve.organization_id = NEW.organization_id
    AND ve.reference_id = NEW.reference_id
    AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
    AND ve.deleted_at IS NULL
    AND ve.id IS DISTINCT FROM NEW.id;

  IF (v_existing + v_incoming) > (COALESCE(v_net, 0) + 1) THEN
    RAISE EXCEPTION
      'Advance over-application blocked. Sale net: %, already applied: %, this voucher: %',
      v_net, v_existing, v_incoming
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_advance_over_application() IS
  'BEFORE INSERT/UPDATE on voucher_entries: block advance_adjustment receipts that would push Σ advances above sales.net_amount (+1). Raises; does not skip.';

DROP TRIGGER IF EXISTS trg_guard_advance_over_application ON public.voucher_entries;

CREATE TRIGGER trg_guard_advance_over_application
  BEFORE INSERT OR UPDATE OF total_amount, payment_method, voucher_type, reference_id, deleted_at, organization_id
  ON public.voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_advance_over_application();

-- ---------------------------------------------------------------------------
-- Manual verification (run in SQL editor after apply; do not leave in txn):
--
-- 1) Legitimate exact fill must SUCCEED when existing Σ + new = net:
--    Suppose sale net = 1000, existing advance_adjustment Σ = 600.
--    Insert receipt advance_adjustment 400 → OK (600+400 = 1000 <= 1001).
--
-- 2) Second pass that would exceed must FAIL:
--    Same sale, existing Σ = 1000, insert advance_adjustment 1 → RAISE.
--
-- 3) Soft-delete of an advance_adjustment must SUCCEED (sets deleted_at).
-- ---------------------------------------------------------------------------
