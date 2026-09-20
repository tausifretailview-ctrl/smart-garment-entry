-- =============================================================================
-- Guardrails: customer_advances.used_amount over-application (pool + per-row).
--
-- Root cause (app + existing guards):
--   * guard_advance_over_application only caps Σ advance_adjustment per SALE,
--     not per CUSTOMER pool (SUM(amount) − SUM(refund_amount)).
--   * consumeAdvanceFIFO also wrote used_amount, then voucher INSERT fired
--     trg_sync_customer_advances_used → recompute from vouchers; concurrent
--     per-sale passes could insert vouchers totaling more than the pool while
--     per-row used_amount stayed ≤ amount (AFIFA / Siya Kapoor class).
--
-- This migration adds:
--   1) BEFORE trigger on customer_advances (per-row used ≤ amount).
--   2) Customer pool cap on advance_adjustment voucher INSERT/UPDATE (advisory lock).
-- Per-row CHECK (NOT VALID) lives in 20260920210000_* — apply in a quiet window
-- to avoid 40P01 deadlock with live advance_apply + voucher sync triggers.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- Helpers (pool = booked advances − refunds; applied = live advance_adjustment memos)
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public._customer_advance_pool_cap(
  p_organization_id uuid,
  p_customer_id uuid
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(
    (
      SELECT COALESCE(SUM(ca.amount), 0)
      FROM public.customer_advances ca
      WHERE ca.organization_id = p_organization_id
        AND ca.customer_id = p_customer_id
    )
    -
    (
      SELECT COALESCE(SUM(ar.refund_amount), 0)
      FROM public.advance_refunds ar
      INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
      WHERE ca.organization_id = p_organization_id
        AND ca.customer_id = p_customer_id
    ),
    0
  );
$$;

COMMENT ON FUNCTION public._customer_advance_pool_cap(uuid, uuid) IS
  'Net advance pool for a customer: SUM(customer_advances.amount) − SUM(advance_refunds.refund_amount).';

CREATE OR REPLACE FUNCTION public._customer_advance_applied_from_vouchers(
  p_organization_id uuid,
  p_customer_id uuid,
  p_exclude_voucher_id uuid DEFAULT NULL
)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  SELECT COALESCE(SUM(ve.total_amount), 0)
  FROM public.voucher_entries ve
  LEFT JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND (
      lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      OR COALESCE(ve.description, '') ILIKE '%adjusted from advance balance%'
    )
    AND (
      (s.id IS NOT NULL AND s.customer_id = p_customer_id)
      OR (
        s.id IS NULL
        AND lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND ve.reference_id = p_customer_id
      )
    )
    AND (p_exclude_voucher_id IS NULL OR ve.id IS DISTINCT FROM p_exclude_voucher_id);
$$;

COMMENT ON FUNCTION public._customer_advance_applied_from_vouchers(uuid, uuid, uuid) IS
  'Σ live advance application receipts for a customer (sale-linked + customer OB), same basis as recompute_customer_advances_used.';

-- ---------------------------------------------------------------------------
-- 1) BEFORE INSERT/UPDATE on customer_advances — per-row cap
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.guard_customer_advances_used_amount()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  IF NEW.customer_id IS NULL OR NEW.organization_id IS NULL THEN
    RETURN NEW;
  END IF;

  -- Per booking only. Customer-wide pool is enforced on advance_adjustment
  -- voucher INSERT (guard_advance_over_application) because refunds bump
  -- used_amount toward amount without a matching voucher decrement.
  IF COALESCE(NEW.used_amount, 0) > COALESCE(NEW.amount, 0) + 0.5 THEN
    RAISE EXCEPTION
      'Advance booking %: applied amount (%) exceeds booked amount (%). Refresh and try again.',
      COALESCE(NEW.advance_number, NEW.id::text),
      NEW.used_amount,
      NEW.amount
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_customer_advances_used_amount() IS
  'BEFORE INSERT/UPDATE on customer_advances: reject used_amount above this booking amount (+₹0.5). Customer pool cap is on voucher_entries.';

DROP TRIGGER IF EXISTS trg_guard_customer_advances_used_amount ON public.customer_advances;

CREATE TRIGGER trg_guard_customer_advances_used_amount
  BEFORE INSERT OR UPDATE OF used_amount, amount, customer_id, organization_id
  ON public.customer_advances
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_customer_advances_used_amount();

-- ---------------------------------------------------------------------------
-- 2) Extend voucher guard — customer pool + serialize per customer (closes multi-invoice over-apply)
-- ---------------------------------------------------------------------------

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
  v_customer_id uuid;
  v_pool NUMERIC;
  v_applied NUMERIC;
BEGIN
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
  SELECT s.net_amount, s.customer_id
  INTO v_net, v_customer_id
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
        'Advance over-application blocked for this invoice. Invoice net: %, advance already on invoice: %, this receipt: %',
        v_net, v_existing, v_incoming
        USING ERRCODE = 'check_violation';
    END IF;

    IF v_customer_id IS NOT NULL THEN
      -- Serialize advance_apply per customer (avoids FOR UPDATE on customer_advances during DDL).
      PERFORM pg_advisory_xact_lock(
        hashtextextended(NEW.organization_id::text || ':advance_pool:' || v_customer_id::text, 0)
      );

      v_pool := public._customer_advance_pool_cap(NEW.organization_id, v_customer_id);
      v_applied := public._customer_advance_applied_from_vouchers(
        NEW.organization_id,
        v_customer_id,
        NEW.id
      );

      IF (v_applied + v_incoming) > (v_pool + 0.5) THEN
        RAISE EXCEPTION
          'Advance pool exceeded: customer net advance pool is %, already applied on invoices %, this receipt %. Refresh customer balance or record a new advance booking before applying more.',
          v_pool, v_applied, v_incoming
          USING ERRCODE = 'check_violation';
      END IF;
    END IF;

    RETURN NEW;
  END IF;

  -- ---- Customer-scoped opening-balance target ----
  IF LOWER(COALESCE(NEW.reference_type, '')) IS DISTINCT FROM 'customer' THEN
    RETURN NEW;
  END IF;

  v_customer_id := NEW.reference_id;

  SELECT COALESCE(c.opening_balance, 0)
  INTO v_opening
  FROM public.customers c
  WHERE c.id = NEW.reference_id
    AND c.organization_id = NEW.organization_id;

  IF NOT FOUND THEN
    RETURN NEW;
  END IF;

  IF COALESCE(v_opening, 0) <= 0 THEN
    RAISE EXCEPTION
      'Advance over-application blocked. Customer opening balance is %, this voucher: %',
      v_opening, v_incoming
      USING ERRCODE = 'check_violation';
  END IF;

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

  PERFORM pg_advisory_xact_lock(
    hashtextextended(NEW.organization_id::text || ':advance_pool:' || v_customer_id::text, 0)
  );

  v_pool := public._customer_advance_pool_cap(NEW.organization_id, v_customer_id);
  v_applied := public._customer_advance_applied_from_vouchers(
    NEW.organization_id,
    v_customer_id,
    NEW.id
  );

  IF (v_applied + v_incoming) > (v_pool + 0.5) THEN
    RAISE EXCEPTION
      'Advance pool exceeded: customer net advance pool is %, already applied %, this receipt %. Record or refresh advance balance before applying more.',
      v_pool, v_applied, v_incoming
      USING ERRCODE = 'check_violation';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_advance_over_application() IS
  'BEFORE INSERT/UPDATE on voucher_entries: per-invoice net cap, OB remaining cap, and customer-wide advance pool cap on advance_adjustment receipts. pg_advisory_xact_lock per customer.';

-- Trigger already exists from 20260729140000; body replaced above.

-- ---------------------------------------------------------------------------
-- Audit query (run manually; do not mutate in this migration):
--
-- SELECT c.customer_name,
--   public._customer_advance_pool_cap(c.organization_id, c.id) AS pool,
--   public._customer_advance_applied_from_vouchers(c.organization_id, c.id, NULL) AS applied,
--   public._customer_advance_applied_from_vouchers(c.organization_id, c.id, NULL)
--     - public._customer_advance_pool_cap(c.organization_id, c.id) AS over_applied
-- FROM customers c
-- WHERE c.organization_id = '<org>'
-- HAVING ... filter over_applied > 0.5
-- ---------------------------------------------------------------------------
