-- =============================================================================
-- Attach / (re)define guard_advance_over_application on voucher_entries.
--
-- Checkout note (2026-07-29): this function name does NOT appear in any prior
-- migration in this repo. Live DB may already have a copy; CREATE OR REPLACE
-- makes the body authoritative. Intended behaviour:
--   * BEFORE INSERT (and UPDATE that keeps the row live) on voucher_entries
--   * Only for voucher_type = 'receipt' AND payment_method = 'advance_adjustment'
--   * Sale target: (existing live advance_adjustment Σ + NEW.total_amount)
--     must not exceed sales.net_amount (+ ₹1 tolerance)
--   * Customer / opening-balance target: NEW.total_amount must not exceed
--     remaining OB (+ ₹1), where remaining matches
--     fetchCustomerOpeningBalanceRemaining exactly:
--       customers.opening_balance − Σ(total_amount + discount_amount)
--       over live customer-scoped receipts excluding the incoming row
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
  v_opening NUMERIC;
  v_ob_paid NUMERIC;
  v_ob_remaining NUMERIC;
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

  -- ---- Sale-linked target ----
  SELECT s.net_amount
  INTO v_net
  FROM public.sales s
  WHERE s.id = NEW.reference_id
    AND s.organization_id = NEW.organization_id
    AND s.deleted_at IS NULL;

  IF FOUND THEN
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
  END IF;

  -- ---- Customer-scoped opening-balance target ----
  IF LOWER(COALESCE(NEW.reference_type, '')) IS DISTINCT FROM 'customer' THEN
    -- Orphan / non-customer non-sale reference: do not invent policy
    RETURN NEW;
  END IF;

  SELECT COALESCE(c.opening_balance, 0)
  INTO v_opening
  FROM public.customers c
  WHERE c.id = NEW.reference_id
    AND c.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  -- Cap floors at zero: no advance against zero/negative opening_balance
  IF COALESCE(v_opening, 0) <= 0 THEN
    RAISE EXCEPTION
      'Advance over-application blocked. Customer opening balance is %, this voucher: %',
      v_opening, v_incoming
      USING ERRCODE = 'check_violation';
  END IF;

  -- Same denominator as fetchCustomerOpeningBalanceRemaining
  SELECT COALESCE(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 0)
  INTO v_ob_paid
  FROM public.voucher_entries ve
  WHERE ve.organization_id = NEW.organization_id
    AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND LOWER(COALESCE(ve.reference_type, '')) = 'customer'
    AND ve.reference_id = NEW.reference_id
    AND ve.deleted_at IS NULL
    AND ve.id IS DISTINCT FROM NEW.id;

  v_ob_remaining := GREATEST(0, COALESCE(v_opening, 0) - COALESCE(v_ob_paid, 0));

  IF v_incoming > (v_ob_remaining + 1) THEN
    RAISE EXCEPTION
      'Advance over-application blocked. Opening balance remaining: %, this voucher: %',
      v_ob_remaining, v_incoming
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_advance_over_application() IS
  'BEFORE INSERT/UPDATE on voucher_entries: block advance_adjustment receipts that would push Σ advances above sales.net_amount (+1) or above remaining customer opening balance (+1). Raises; does not skip.';

DROP TRIGGER IF EXISTS trg_guard_advance_over_application ON public.voucher_entries;

CREATE TRIGGER trg_guard_advance_over_application
  BEFORE INSERT OR UPDATE OF total_amount, payment_method, voucher_type, reference_id, reference_type, deleted_at, organization_id
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
--
-- 4) Customer-scoped OB: remaining = opening_balance − Σ(customer receipts).
--    Insert advance_adjustment ≤ remaining + 1 → OK; above → RAISE.
-- ---------------------------------------------------------------------------
