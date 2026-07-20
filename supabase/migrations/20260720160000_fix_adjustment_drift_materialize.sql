-- Fix Adjustment Drift repair: no ledger double-count on materialize,
-- payment_method = balance_adjustment, platform_admin auth, voucher id tracking.
-- Also exclude materialized floaters from reconcile_customer_balance (+ v2 wrapper).

-- 1) Ledger: only unmaterialized adjustments count as floating credit/debit
CREATE OR REPLACE FUNCTION public.reconcile_customer_balance(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  source text,
  amount numeric,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
    ) AND NOT public.has_role(auth.uid(), 'platform_admin') THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found in organization' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    'opening_balance'::text,
    COALESCE(
      (SELECT c.opening_balance FROM public.customers c
       WHERE c.id = p_customer_id AND c.organization_id = p_organization_id AND c.deleted_at IS NULL),
      0
    )::numeric,
    'customers.opening_balance'::text;

  RETURN QUERY
  SELECT
    'balance_adjustment'::text,
    COALESCE(SUM(cba.outstanding_difference), 0)::numeric,
    'customer_balance_adjustments (unmaterialized outstanding_difference)'::text
  FROM public.customer_balance_adjustments cba
  WHERE cba.customer_id = p_customer_id
    AND cba.organization_id = p_organization_id
    AND cba.materialized_at IS NULL;

  RETURN QUERY
  SELECT
    'total_invoiced'::text,
    COALESCE(SUM(s.net_amount), 0)::numeric,
    'sales.net_amount (excl cancelled/hold)'::text
  FROM public.sales s
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT
    'sale_return_adjust_on_invoices'::text,
    (-COALESCE(SUM(
      CASE
        WHEN COALESCE(ig.gross, 0) > 0
             AND COALESCE(s.sale_return_adjust, 0) > 0
             AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
        THEN 0
        ELSE COALESCE(s.sale_return_adjust, 0)
      END
    ), 0))::numeric,
    'sales.sale_return_adjust gated on items_gross (pre-return / legacy only)'::text
  FROM public.sales s
  LEFT JOIN (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM public.sale_items si
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ) ig ON ig.sale_id = s.id
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT
    'receipt_payments'::text,
    (-COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0))::numeric,
    'voucher_entries receipt (sale-linked or opening; excl advance_application)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT (
      lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      OR lower(trim(COALESCE(ve.description, ''))) LIKE 'advance applied to %'
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND s.customer_id = p_customer_id
          AND s.id::text = ve.reference_id::text
      )
      OR (
        lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text)
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text
        )
      )
    );

  RETURN QUERY
  SELECT
    'paid_at_sale_drift'::text,
    (-COALESCE(SUM(sub.drift), 0))::numeric,
    'POS cash/UPI tender minus receipt vouchers (excl advance-only paid_amount)'::text
  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(
        COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
      )
      - COALESCE((
        SELECT SUM(
          GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
        )
        FROM public.voucher_entries ve
        WHERE ve.organization_id = p_organization_id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
      ), 0)
    ) AS drift
    FROM public.sales s
    WHERE s.customer_id = p_customer_id
      AND s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
      AND (
        GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      ) > 0.005
  ) sub
  WHERE sub.drift > 0;

  RETURN QUERY
  SELECT
    'pending_sale_returns'::text,
    (-COALESCE(SUM(
      GREATEST(
        0::numeric,
        COALESCE(sr.net_amount, 0)
          - COALESCE(
            (
              SELECT s.sale_return_adjust
              FROM public.sales s
              WHERE s.id = sr.linked_sale_id
                AND s.organization_id = p_organization_id
                AND s.deleted_at IS NULL
            ),
            0
          )
      )
    ), 0))::numeric,
    'sale_returns pending — net of sale_return_adjust on linked invoice only'::text
  FROM public.sale_returns sr
  WHERE sr.customer_id = p_customer_id
    AND sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL
    AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending';

  RETURN QUERY
  SELECT
    'credit_note_vouchers'::text,
    (-COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0))::numeric,
    'voucher_entries type=credit_note ref=customer'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text);

  RETURN QUERY
  SELECT
    'customer_payment_refunds'::text,
    (-COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0))::numeric,
    'voucher_entries type=payment ref=customer (reduces receivable)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text);

  RETURN QUERY
  SELECT
    'advances_applied'::text,
    (-COALESCE(SUM(ca.used_amount), 0))::numeric,
    'customer_advances.used_amount'::text
  FROM public.customer_advances ca
  WHERE ca.customer_id = p_customer_id
    AND ca.organization_id = p_organization_id;

  RETURN QUERY
  WITH adv AS (
    SELECT COALESCE(SUM(ca.amount), 0) AS total_amount,
           COALESCE(SUM(ca.used_amount), 0) AS total_used
    FROM public.customer_advances ca
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  ),
  ref AS (
    SELECT COALESCE(SUM(ar.refund_amount), 0) AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  )
  SELECT
    'unused_advances'::text,
    (-GREATEST(
      0::numeric,
      (SELECT total_amount - total_used FROM adv) - (SELECT total_refunds FROM ref)
    ))::numeric,
    'customer_advances unused net of refunds (matches customerAuditMath)'::text;

  RETURN;
END;
$$;

-- Point v2 at the same components (repair guard uses v2)
CREATE OR REPLACE FUNCTION public.reconcile_customer_balance_v2(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  source text,
  amount numeric,
  detail text
)
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT r.source, r.amount, r.detail
  FROM public.reconcile_customer_balance(p_customer_id, p_organization_id) r;
$$;

COMMENT ON FUNCTION public.reconcile_customer_balance_v2(uuid, uuid) IS
  'Alias of reconcile_customer_balance; excludes materialized balance adjustments.';

GRANT EXECUTE ON FUNCTION public.reconcile_customer_balance(uuid, uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.reconcile_customer_balance_v2(uuid, uuid) TO authenticated, service_role;

-- 2) Shared auth helper for drift RPCs
CREATE OR REPLACE FUNCTION public._assert_adjustment_drift_access(p_organization_id uuid)
RETURNS void
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN; -- service_role
  END IF;
  IF public.has_role(auth.uid(), 'platform_admin') THEN
    RETURN;
  END IF;
  IF EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_organization_id
      AND lower(om.role::text) IN ('admin', 'owner', 'platform_admin')
  ) THEN
    RETURN;
  END IF;
  RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
END;
$$;

-- 3) Detect (auth fix only; body same as latest candidate-scoped version)
CREATE OR REPLACE FUNCTION public.detect_balance_adjustment_drift(
  p_organization_id uuid,
  p_min_drift numeric DEFAULT 1.0
)
RETURNS TABLE(
  customer_id uuid,
  customer_name text,
  ledger_closing numeric,
  invoice_pending_sum numeric,
  opening_pending numeric,
  floating_adjustment_pool numeric,
  drift numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
BEGIN
  PERFORM public._assert_adjustment_drift_access(p_organization_id);

  RETURN QUERY
  WITH candidates AS (
    SELECT DISTINCT cba.customer_id
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
      AND cba.materialized_at IS NULL
      AND cba.outstanding_difference < 0
  ),
  ledger AS (
    SELECT c.id AS cid, c.customer_name AS cname,
           COALESCE((SELECT SUM(amount) FROM public.reconcile_customer_balance_v2(c.id, p_organization_id)), 0)::numeric AS closing
    FROM public.customers c
    JOIN candidates ca ON ca.customer_id = c.id
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  invoice_pending AS (
    SELECT s.customer_id,
           SUM(GREATEST(0, s.net_amount - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt' AND ve.reference_id = s.id
           ), 0) - COALESCE(s.sale_return_adjust, 0)))::numeric AS pending_sum
    FROM public.sales s
    JOIN candidates ca ON ca.customer_id = s.customer_id
    WHERE s.organization_id = p_organization_id AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status,'')) NOT IN ('cancelled','hold')
    GROUP BY s.customer_id
  ),
  opening_pending AS (
    SELECT c.id AS cid,
           GREATEST(0, COALESCE(c.opening_balance,0) - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
               AND lower(COALESCE(ve.reference_type,'')) = 'customer'
               AND ve.reference_id = c.id
               AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id)
           ), 0))::numeric AS pending
    FROM public.customers c
    JOIN candidates ca ON ca.customer_id = c.id
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  floating AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference)::numeric AS pool
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
      AND cba.materialized_at IS NULL
      AND cba.outstanding_difference < 0
    GROUP BY cba.customer_id
  )
  SELECT l.cid, l.cname, l.closing,
         COALESCE(ip.pending_sum, 0), COALESCE(op.pending, 0),
         COALESCE(f.pool, 0),
         ROUND(ABS(l.closing - (COALESCE(ip.pending_sum,0) + COALESCE(op.pending,0))), 2)
  FROM ledger l
  LEFT JOIN invoice_pending ip ON ip.customer_id = l.cid
  LEFT JOIN opening_pending op ON op.cid = l.cid
  LEFT JOIN floating f ON f.customer_id = l.cid
  WHERE ABS(l.closing - (COALESCE(ip.pending_sum,0) + COALESCE(op.pending,0))) > p_min_drift
  ORDER BY 7 DESC;
END;
$fn$;

-- 4) Repair: balance_adjustment vouchers, zero floater on materialize, abort if residual
CREATE OR REPLACE FUNCTION public.repair_customer_floating_adjustments(
  p_organization_id uuid,
  p_customer_id uuid,
  p_dry_run boolean DEFAULT true
)
RETURNS TABLE(
  action text,
  reference_type text,
  reference_id uuid,
  reference_label text,
  amount numeric,
  voucher_id uuid
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_before_closing numeric;
  v_after_closing numeric;
  v_pool numeric;
  v_remaining numeric;
  v_alloc numeric;
  v_voucher_id uuid;
  v_adj_ids uuid[];
  v_voucher_ids uuid[] := ARRAY[]::uuid[];
  v_target record;
  v_op_pending numeric;
  v_actor uuid;
  v_first_adj_date date;
  v_adj_markers text;
  v_new_paid numeric;
  v_new_status text;
BEGIN
  PERFORM public._assert_adjustment_drift_access(p_organization_id);

  v_actor := auth.uid();

  SELECT COALESCE(SUM(amount),0) INTO v_before_closing
  FROM public.reconcile_customer_balance_v2(p_customer_id, p_organization_id);

  SELECT COALESCE(SUM(-cba.outstanding_difference), 0),
         ARRAY_AGG(cba.id ORDER BY cba.adjustment_date, cba.created_at),
         MIN(cba.adjustment_date),
         string_agg('adj_id:' || cba.id::text, ' ' ORDER BY cba.adjustment_date, cba.created_at)
    INTO v_pool, v_adj_ids, v_first_adj_date, v_adj_markers
  FROM public.customer_balance_adjustments cba
  WHERE cba.organization_id = p_organization_id
    AND cba.customer_id = p_customer_id
    AND cba.materialized_at IS NULL
    AND cba.outstanding_difference < 0;

  IF v_pool IS NULL OR v_pool <= 0 THEN
    RETURN;
  END IF;

  v_remaining := v_pool;

  SELECT GREATEST(0, COALESCE(c.opening_balance,0) - COALESCE((
    SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
      AND lower(COALESCE(ve.reference_type,'')) = 'customer'
      AND ve.reference_id = c.id
      AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id)
  ),0))
  INTO v_op_pending
  FROM public.customers c
  WHERE c.id = p_customer_id AND c.organization_id = p_organization_id;

  IF COALESCE(v_op_pending,0) > 0 AND v_remaining > 0 THEN
    v_alloc := LEAST(v_remaining, v_op_pending);
    v_voucher_id := gen_random_uuid();
    IF NOT p_dry_run THEN
      INSERT INTO public.voucher_entries(
        id, organization_id, voucher_number, voucher_type, voucher_date,
        reference_type, reference_id, description, total_amount,
        payment_method, category, created_by
      ) VALUES (
        v_voucher_id, p_organization_id,
        'REPAIR/' || to_char(now(),'YYMMDDHH24MISS') || '/OB',
        'receipt', COALESCE(v_first_adj_date, CURRENT_DATE),
        'customer', p_customer_id,
        'Auto-repair: floating adjustment to Opening Balance | ' || COALESCE(v_adj_markers, ''),
        v_alloc, 'balance_adjustment', 'sale', v_actor
      );
      v_voucher_ids := array_append(v_voucher_ids, v_voucher_id);
    END IF;
    v_remaining := v_remaining - v_alloc;
    action := 'allocate'; reference_type := 'opening_balance'; reference_id := p_customer_id;
    reference_label := 'Opening Balance'; amount := v_alloc; voucher_id := v_voucher_id;
    RETURN NEXT;
  END IF;

  FOR v_target IN
    SELECT s.id, s.sale_number, s.sale_date,
           s.net_amount - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt' AND ve.reference_id = s.id
           ),0) - COALESCE(s.sale_return_adjust,0) AS pending
    FROM public.sales s
    WHERE s.organization_id = p_organization_id AND s.customer_id = p_customer_id
      AND s.deleted_at IS NULL AND COALESCE(s.is_cancelled,false) = false
      AND lower(COALESCE(s.payment_status,'')) NOT IN ('cancelled','hold')
    ORDER BY s.sale_date, s.created_at
  LOOP
    EXIT WHEN v_remaining <= 0;
    CONTINUE WHEN COALESCE(v_target.pending,0) <= 0;
    v_alloc := LEAST(v_remaining, v_target.pending);
    v_voucher_id := gen_random_uuid();
    IF NOT p_dry_run THEN
      INSERT INTO public.voucher_entries(
        id, organization_id, voucher_number, voucher_type, voucher_date,
        reference_type, reference_id, description, total_amount,
        payment_method, category, created_by
      ) VALUES (
        v_voucher_id, p_organization_id,
        'REPAIR/' || to_char(now(),'YYMMDDHH24MISS') || '/' || substr(v_voucher_id::text,1,6),
        'receipt', COALESCE(v_first_adj_date, CURRENT_DATE),
        'sale', v_target.id,
        'Auto-repair: floating adjustment to ' || v_target.sale_number || ' | ' || COALESCE(v_adj_markers, ''),
        v_alloc, 'balance_adjustment', 'sale', v_actor
      );
      v_voucher_ids := array_append(v_voucher_ids, v_voucher_id);

      -- Defense-in-depth: sync paid_amount / payment_status (trigger should also fire)
      SELECT cs.new_paid, cs.new_status
        INTO v_new_paid, v_new_status
      FROM public.compute_sale_settlement(v_target.id, p_organization_id) cs;
      IF v_new_paid IS NOT NULL THEN
        UPDATE public.sales s
        SET paid_amount = v_new_paid,
            payment_status = v_new_status,
            updated_at = now()
        WHERE s.id = v_target.id
          AND s.organization_id = p_organization_id;
      END IF;
    END IF;
    v_remaining := v_remaining - v_alloc;
    action := 'allocate'; reference_type := 'sale'; reference_id := v_target.id;
    reference_label := v_target.sale_number; amount := v_alloc; voucher_id := v_voucher_id;
    RETURN NEXT;
  END LOOP;

  IF v_remaining > 0.01 THEN
    action := 'residual_unallocated'; reference_type := NULL; reference_id := NULL;
    reference_label := 'Pool remainder (no more pending invoices/opening balance)';
    amount := v_remaining; voucher_id := NULL;
    RETURN NEXT;
    -- Refuse apply when residual remains — would leave floater + receipts inconsistently
    IF NOT p_dry_run THEN
      RAISE EXCEPTION
        'Repair aborted: ₹% could not be allocated to opening balance/invoices. Dry-run only for residual cases.',
        ROUND(v_remaining, 2)
        USING ERRCODE = 'P0001';
    END IF;
    RETURN;
  END IF;

  IF NOT p_dry_run THEN
    -- Drop floater from ledger (outstanding_difference → 0) and mark materialized
    UPDATE public.customer_balance_adjustments
       SET outstanding_difference = 0,
           materialized_at = now(),
           materialized_by = v_actor,
           materialized_voucher_ids = v_voucher_ids
     WHERE id = ANY(v_adj_ids);

    SELECT COALESCE(SUM(amount),0) INTO v_after_closing
    FROM public.reconcile_customer_balance_v2(p_customer_id, p_organization_id);

    IF ABS(v_after_closing - v_before_closing) > 1.0 THEN
      RAISE EXCEPTION 'Repair aborted: closing balance would change from % to %. Rolling back.',
        v_before_closing, v_after_closing USING ERRCODE = 'P0001';
    END IF;
  END IF;
END;
$fn$;

REVOKE ALL ON FUNCTION public.detect_balance_adjustment_drift(uuid, numeric) FROM PUBLIC, anon;
REVOKE ALL ON FUNCTION public.repair_customer_floating_adjustments(uuid, uuid, boolean) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detect_balance_adjustment_drift(uuid, numeric) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.repair_customer_floating_adjustments(uuid, uuid, boolean) TO authenticated, service_role;
