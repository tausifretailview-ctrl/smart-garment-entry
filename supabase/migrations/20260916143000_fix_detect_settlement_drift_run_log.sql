-- Fix detect_settlement_drift run-log INSERT: 20260914062010 referenced
-- scope_organization_id, which was never added to drift_detection_runs.
-- The table uses organization_id (NULL = all-org scan) and orgs_scanned.

CREATE OR REPLACE FUNCTION public.detect_settlement_drift(p_organization_id uuid DEFAULT NULL::uuid)
 RETURNS TABLE(org_id uuid, drifts_found integer)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_total_drifts integer := 0;
  v_critical integer := 0;
  v_orgs_scanned integer := 0;
BEGIN
  -- SECURITY: cross-tenant scan that writes settlement_drift_log / drift_detection_runs.
  -- Only platform admins (or the service role / cron job, where auth.uid() IS NULL) may run it.
  IF auth.uid() IS NOT NULL AND NOT public.has_role(auth.uid(), 'platform_admin') THEN
    RAISE EXCEPTION 'Not authorized to run settlement drift detection'
      USING ERRCODE = '42501';
  END IF;

  WITH voucher_agg AS (
    SELECT
      ve.reference_id AS sale_id,
      SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))) AS voucher_paid,
      BOOL_OR(ve.payment_method IN ('credit_note_adjustment','advance_adjustment','balance_adjustment')) AS has_credit_backing
    FROM public.voucher_entries ve
    WHERE ve.voucher_type = 'receipt'
      AND ve.deleted_at IS NULL
      AND ve.reference_id IS NOT NULL
    GROUP BY ve.reference_id
  ),
  candidates AS (
    SELECT
      s.id AS sale_id,
      s.organization_id,
      s.customer_id,
      s.sale_number,
      COALESCE(s.net_amount, 0) AS net_amount,
      COALESCE(s.paid_amount, 0) AS recorded_paid,
      COALESCE(va.voucher_paid, 0) AS voucher_paid,
      s.payment_status AS recorded_status,
      COALESCE(s.credit_applied, 0) AS credit_applied,
      COALESCE(s.sale_return_adjust, 0) AS sale_return_adjust,
      COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0) AS tender,
      COALESCE(va.has_credit_backing, FALSE) AS has_credit_backing
    FROM public.sales s
    LEFT JOIN voucher_agg va ON va.sale_id = s.id
    WHERE s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, FALSE) = FALSE
      AND (p_organization_id IS NULL OR s.organization_id = p_organization_id)
  ),
  classified AS (
    SELECT
      c.*,
      GREATEST(c.voucher_paid, c.tender) AS evidence_paid,
      (c.net_amount - c.recorded_paid - c.sale_return_adjust) AS residual,
      CASE
        WHEN c.credit_applied > 0.01 AND NOT c.has_credit_backing
          THEN 'PHANTOM_CREDIT'
        WHEN c.recorded_paid > GREATEST(c.voucher_paid, c.tender) + 0.01
          THEN 'OVERSTATED_PAID'
        WHEN c.recorded_paid < c.voucher_paid - 0.01
          THEN 'UNDERSTATED_PAID'
        WHEN c.recorded_paid + c.sale_return_adjust > c.net_amount + 0.01
          THEN 'OVERPAID'
        WHEN c.recorded_status = 'completed'
             AND (c.net_amount - c.recorded_paid - c.sale_return_adjust) > 0.01
          THEN 'STATUS_MISMATCH'
        WHEN c.recorded_status IN ('pending','partial')
             AND (c.net_amount - c.recorded_paid - c.sale_return_adjust) <= 0.01
          THEN 'STATUS_MISMATCH'
        ELSE NULL
      END AS drift_type
    FROM candidates c
  ),
  drifting AS (
    SELECT
      sale_id, organization_id, customer_id, sale_number,
      net_amount, recorded_paid, voucher_paid,
      (recorded_paid - voucher_paid) AS drift_amount,
      recorded_status, drift_type,
      CASE
        WHEN drift_type IN ('PHANTOM_CREDIT','OVERSTATED_PAID') THEN 'critical'
        WHEN drift_type IN ('UNDERSTATED_PAID','STATUS_MISMATCH','OVERPAID') THEN 'warning'
        ELSE 'info'
      END AS severity
    FROM classified
    WHERE drift_type IS NOT NULL
  ),
  upserted AS (
    INSERT INTO public.settlement_drift_log AS d (
      organization_id, sale_id, customer_id, sale_number,
      net_amount, recorded_paid, voucher_paid, drift_amount,
      recorded_status, drift_type, severity, detected_at
    )
    SELECT
      organization_id, sale_id, customer_id, sale_number,
      net_amount, recorded_paid, voucher_paid, drift_amount,
      recorded_status, drift_type, severity, now()
    FROM drifting
    ON CONFLICT (sale_id) WHERE (resolved_at IS NULL)
    DO UPDATE SET
      detected_at     = now(),
      customer_id     = EXCLUDED.customer_id,
      sale_number     = EXCLUDED.sale_number,
      net_amount      = EXCLUDED.net_amount,
      recorded_paid   = EXCLUDED.recorded_paid,
      voucher_paid    = EXCLUDED.voucher_paid,
      drift_amount    = EXCLUDED.drift_amount,
      recorded_status = EXCLUDED.recorded_status,
      drift_type      = EXCLUDED.drift_type,
      severity        = EXCLUDED.severity
    RETURNING d.organization_id, d.severity
  ),
  resolved AS (
    UPDATE public.settlement_drift_log l
    SET resolved_at = now()
    WHERE l.resolved_at IS NULL
      AND (p_organization_id IS NULL OR l.organization_id = p_organization_id)
      AND NOT EXISTS (SELECT 1 FROM drifting dr WHERE dr.sale_id = l.sale_id)
    RETURNING 1
  )
  SELECT
    COUNT(*)::int,
    COUNT(*) FILTER (WHERE severity = 'critical')::int,
    COUNT(DISTINCT organization_id)::int
  INTO v_total_drifts, v_critical, v_orgs_scanned
  FROM upserted;

  INSERT INTO public.drift_detection_runs (
    run_at, drifts_found, critical_count, duration_ms, organization_id, orgs_scanned
  )
  VALUES (
    now(),
    v_total_drifts,
    v_critical,
    (EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::int,
    p_organization_id,
    v_orgs_scanned
  );

  RETURN QUERY
  SELECT l.organization_id, COUNT(*)::int
  FROM public.settlement_drift_log l
  WHERE l.resolved_at IS NULL
    AND (p_organization_id IS NULL OR l.organization_id = p_organization_id)
  GROUP BY l.organization_id;
END;
$function$;
