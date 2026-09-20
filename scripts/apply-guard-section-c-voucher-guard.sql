-- SECTION C — run after Section A (requires helpers). Replaces guard body only; trigger unchanged.
-- If 40P01, retry after 60s — do not run with Section B in the same batch.

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
