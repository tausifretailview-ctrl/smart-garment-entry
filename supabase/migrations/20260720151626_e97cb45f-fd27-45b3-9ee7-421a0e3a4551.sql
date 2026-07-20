
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
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_organization_id
      AND lower(COALESCE(om.role,'')) IN ('admin','owner','platform_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH ledger AS (
    SELECT c.id AS cid, c.name AS cname,
           COALESCE((SELECT SUM(amount) FROM public.reconcile_customer_balance_v2(c.id, p_organization_id)), 0)::numeric AS closing
    FROM public.customers c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  invoice_pending AS (
    SELECT s.customer_id,
           SUM(GREATEST(0, s.net_amount - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id
               AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
               AND ve.reference_id = s.id
           ), 0) - COALESCE(s.sale_return_adjust, 0)))::numeric AS pending_sum
    FROM public.sales s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status,'')) NOT IN ('cancelled','hold')
      AND s.customer_id IS NOT NULL
    GROUP BY s.customer_id
  ),
  opening_pending AS (
    SELECT c.id AS cid,
           GREATEST(0, COALESCE(c.opening_balance,0) - COALESCE((
             SELECT SUM(GREATEST(0, COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)))
             FROM public.voucher_entries ve
             WHERE ve.organization_id = p_organization_id
               AND ve.deleted_at IS NULL
               AND lower(COALESCE(ve.voucher_type,'')) = 'receipt'
               AND lower(COALESCE(ve.reference_type,'')) = 'customer'
               AND ve.reference_id = c.id
               AND NOT EXISTS (SELECT 1 FROM public.sales s2 WHERE s2.id = ve.reference_id)
           ), 0))::numeric AS pending
    FROM public.customers c
    WHERE c.organization_id = p_organization_id AND c.deleted_at IS NULL
  ),
  floating AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference)::numeric AS pool
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id AND cba.materialized_at IS NULL
    GROUP BY cba.customer_id
  )
  SELECT l.cid, l.cname, l.closing,
         COALESCE(ip.pending_sum, 0),
         COALESCE(op.pending, 0),
         COALESCE(f.pool, 0),
         ROUND(ABS(l.closing - (COALESCE(ip.pending_sum,0) + COALESCE(op.pending,0))), 2)
  FROM ledger l
  LEFT JOIN invoice_pending ip ON ip.customer_id = l.cid
  LEFT JOIN opening_pending op ON op.cid = l.cid
  LEFT JOIN floating f ON f.customer_id = l.cid
  WHERE ABS(l.closing - (COALESCE(ip.pending_sum,0) + COALESCE(op.pending,0))) > p_min_drift
  ORDER BY drift DESC;
END;
$fn$;

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
  v_target record;
  v_op_pending numeric;
  v_actor uuid;
  v_first_adj_date date;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT EXISTS (
    SELECT 1 FROM public.organization_members om
    WHERE om.user_id = auth.uid()
      AND om.organization_id = p_organization_id
      AND lower(COALESCE(om.role,'')) IN ('admin','owner','platform_admin')
  ) THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;

  v_actor := auth.uid();

  SELECT COALESCE(SUM(amount),0) INTO v_before_closing
  FROM public.reconcile_customer_balance_v2(p_customer_id, p_organization_id);

  SELECT COALESCE(SUM(-cba.outstanding_difference), 0),
         ARRAY_AGG(cba.id ORDER BY cba.adjustment_date, cba.created_at),
         MIN(cba.adjustment_date)
    INTO v_pool, v_adj_ids, v_first_adj_date
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
        'receipt', v_first_adj_date, 'customer', p_customer_id,
        'Auto-repair: floating adjustment materialized to Opening Balance',
        v_alloc, 'adjustment', 'sale', v_actor
      );
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
        'receipt', v_first_adj_date, 'sale', v_target.id,
        'Auto-repair: floating adjustment materialized to ' || v_target.sale_number,
        v_alloc, 'adjustment', 'sale', v_actor
      );
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
  END IF;

  IF NOT p_dry_run THEN
    UPDATE public.customer_balance_adjustments
       SET materialized_at = now(), materialized_by = v_actor
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
