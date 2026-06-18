-- Prevent completed-but-underpaid sales at write time + read-only drift detector.
-- Single settlement tolerance (₹1) shared by compute_sale_settlement, receipt sync,
-- and the new BEFORE trigger on sales. Client derivePaidAndStatus should match (see saleSettlement.ts).

-- ---------------------------------------------------------------------------
-- Part C — canonical tolerance (₹1 round-off / settlement slack)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.sale_settlement_tolerance()
RETURNS numeric
LANGUAGE sql
IMMUTABLE
PARALLEL SAFE
AS $$
  SELECT 1.00::numeric;
$$;

COMMENT ON FUNCTION public.sale_settlement_tolerance() IS
  'Canonical sale settlement slack (₹). Used by derive_sale_payment_status, compute_sale_settlement, '
  'normalize_sale_payment_status_on_write, and get_accounting_drift_report. DB is authoritative on writes.';

-- ---------------------------------------------------------------------------
-- Part A — pure status derivation from net + paid (no receipt recompute)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.derive_sale_payment_status(
  p_net_amount numeric,
  p_paid_amount numeric,
  p_payment_method text DEFAULT NULL
)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  v_tol   numeric := public.sale_settlement_tolerance();
  v_net   numeric := GREATEST(0, COALESCE(p_net_amount, 0));
  v_paid  numeric := GREATEST(0, COALESCE(p_paid_amount, 0));
BEGIN
  IF v_net <= v_tol THEN
    RETURN 'completed';
  END IF;

  IF v_paid >= v_net - v_tol THEN
    RETURN 'completed';
  END IF;

  IF v_paid > v_tol THEN
    RETURN 'partial';
  END IF;

  RETURN 'pending';
END;
$$;

COMMENT ON FUNCTION public.derive_sale_payment_status(numeric, numeric, text) IS
  'Maps net_amount + paid_amount to payment_status using sale_settlement_tolerance(). '
  'Does not handle hold/cancelled — caller must passthrough those workflow states.';

-- Align receipt-sync writer with the same tolerance + status helper.
CREATE OR REPLACE FUNCTION public.compute_sale_settlement(p_sale_id uuid, p_org_id uuid)
RETURNS TABLE(new_paid numeric, new_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net numeric;
  v_sra numeric;
  v_tender numeric;
  v_non_cn numeric;
  v_cn numeric;
  v_genuine_cn numeric;
  v_receipt_total numeric;
  v_payable_cap numeric;
  v_payment_method text;
BEGIN
  SELECT s.net_amount,
         COALESCE(s.sale_return_adjust, 0),
         COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
         s.payment_method
    INTO v_net, v_sra, v_tender, v_payment_method
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold');

  IF NOT FOUND THEN
    RETURN;
  END IF;

  SELECT
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN 0
                      ELSE COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) END), 0),
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                      ELSE 0 END), 0)
    INTO v_non_cn, v_cn
  FROM public.voucher_entries ve
  WHERE ve.reference_id = p_sale_id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type IN ('sale', 'customer')
    AND ve.organization_id = p_org_id
    AND ve.deleted_at IS NULL;

  v_genuine_cn := GREATEST(0, v_cn - v_sra);
  v_receipt_total := v_non_cn + v_genuine_cn;
  v_payable_cap := GREATEST(0, COALESCE(v_net, 0));

  IF COALESCE(v_tender, 0) > v_receipt_total + 0.0001 THEN
    new_paid := LEAST(v_payable_cap, GREATEST(v_receipt_total, v_tender));
  ELSE
    new_paid := LEAST(v_payable_cap, v_receipt_total);
  END IF;

  new_status := public.derive_sale_payment_status(v_payable_cap, new_paid, v_payment_method);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.compute_sale_settlement(uuid, uuid) IS
  'Receipt/tender reconciler for sales.paid_amount + payment_status. Status via derive_sale_payment_status '
  '(sale_settlement_tolerance). trg_sync_sale_payment_status_from_receipts calls this on voucher changes.';

-- BEFORE write normalizer — auto-corrects status to match amounts (never hard-fails billing).
CREATE OR REPLACE FUNCTION public.normalize_sale_payment_status_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text := lower(COALESCE(NEW.payment_status, ''));
  v_derived text;
BEGIN
  IF COALESCE(NEW.is_cancelled, false) THEN
    IF v_current <> 'cancelled' THEN
      NEW.payment_status := 'cancelled';
    END IF;
    RETURN NEW;
  END IF;

  IF v_current = 'hold' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_derived := public.derive_sale_payment_status(
    NEW.net_amount,
    NEW.paid_amount,
    NEW.payment_method
  );

  -- Map legacy 'paid' to canonical 'completed' when settled.
  IF v_derived = 'completed' AND v_current = 'paid' THEN
    NEW.payment_status := 'completed';
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_status, '') IS DISTINCT FROM v_derived THEN
    NEW.payment_status := v_derived;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.normalize_sale_payment_status_on_write() IS
  'BEFORE INSERT/UPDATE on sales: normalizes payment_status to match paid_amount vs net_amount '
  'using sale_settlement_tolerance (auto-correct, no RAISE). Runs after enforce_pay_later_zero_paid.';

DROP TRIGGER IF EXISTS trg_normalize_sale_payment_status_on_write ON public.sales;
CREATE TRIGGER trg_normalize_sale_payment_status_on_write
  BEFORE INSERT OR UPDATE OF paid_amount, payment_status, net_amount, payment_method, is_cancelled, sale_return_adjust
  ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.normalize_sale_payment_status_on_write();

-- ---------------------------------------------------------------------------
-- Part B — read-only drift detector (per org)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.get_accounting_drift_report(p_organization_id uuid)
RETURNS TABLE (
  drift_type text,
  row_count bigint,
  amount_total numeric,
  detail text
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tol numeric := public.sale_settlement_tolerance();
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  -- 1) completed/paid but underpaid beyond tolerance
  RETURN QUERY
  SELECT
    'completed_underpaid'::text,
    COUNT(*)::bigint,
    COALESCE(SUM(GREATEST(0, s.net_amount - COALESCE(s.paid_amount, 0))), 0)::numeric,
    'Sales marked completed/paid where paid_amount < net_amount - tolerance'::text
  FROM public.sales s
  WHERE s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) IN ('completed', 'paid')
    AND COALESCE(s.net_amount, 0) > v_tol
    AND COALESCE(s.paid_amount, 0) < COALESCE(s.net_amount, 0) - v_tol;

  -- 2) partial but fully settled (should be completed)
  RETURN QUERY
  SELECT
    'partial_should_be_completed'::text,
    COUNT(*)::bigint,
    COALESCE(SUM(COALESCE(s.net_amount, 0)), 0)::numeric,
    'Sales marked partial where paid_amount >= net_amount - tolerance'::text
  FROM public.sales s
  WHERE s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) = 'partial'
    AND COALESCE(s.net_amount, 0) > v_tol
    AND COALESCE(s.paid_amount, 0) >= COALESCE(s.net_amount, 0) - v_tol;

  -- 3) zero paid but marked completed/paid (non-trivial net)
  RETURN QUERY
  SELECT
    'completed_zero_paid'::text,
    COUNT(*)::bigint,
    COALESCE(SUM(COALESCE(s.net_amount, 0)), 0)::numeric,
    'Sales marked completed/paid with paid_amount = 0 and net_amount > tolerance'::text
  FROM public.sales s
  WHERE s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) IN ('completed', 'paid')
    AND COALESCE(s.net_amount, 0) > v_tol
    AND COALESCE(s.paid_amount, 0) <= v_tol;

  -- 4) customer snapshot vs reconcile_customer_balances calculated_balance
  RETURN QUERY
  WITH snap AS (
    SELECT
      c.id AS customer_id,
      gfs.outstanding_dr AS snapshot_outstanding
    FROM public.customers c
    CROSS JOIN LATERAL public.get_customer_financial_snapshot(c.id, p_organization_id) AS gfs
    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ),
  rec AS (
    SELECT
      r.customer_id,
      r.calculated_balance
    FROM public.reconcile_customer_balances(p_organization_id) AS r
  ),
  mism AS (
    SELECT
      s.customer_id,
      ABS(COALESCE(s.snapshot_outstanding, 0) - COALESCE(r.calculated_balance, 0)) AS delta
    FROM snap s
    JOIN rec r ON r.customer_id = s.customer_id
    WHERE ABS(COALESCE(s.snapshot_outstanding, 0) - COALESCE(r.calculated_balance, 0)) > v_tol
  )
  SELECT
    'customer_snapshot_drift'::text,
    COUNT(*)::bigint,
    COALESCE(SUM(delta), 0)::numeric,
    'Customers where get_customer_financial_snapshot.outstanding_dr <> reconcile_customer_balances.calculated_balance'::text
  FROM mism;

  RETURN;
END;
$$;

COMMENT ON FUNCTION public.get_accounting_drift_report(uuid) IS
  'Read-only integrity report: payment-status drift on sales + customer snapshot vs reconciliation. '
  'Does not mutate data. Uses sale_settlement_tolerance() throughout.';

GRANT EXECUTE ON FUNCTION public.sale_settlement_tolerance() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.derive_sale_payment_status(numeric, numeric, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.compute_sale_settlement(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.normalize_sale_payment_status_on_write() TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_accounting_drift_report(uuid) TO authenticated, service_role;
