
-- 1) Drift log table
CREATE TABLE public.settlement_drift_log (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  detected_at       timestamptz NOT NULL DEFAULT now(),
  organization_id   uuid NOT NULL,
  sale_id           uuid NOT NULL,
  customer_id       uuid,
  sale_number       text,
  net_amount        numeric,
  recorded_paid     numeric,
  voucher_paid      numeric,
  drift_amount      numeric,
  recorded_status   text,
  drift_type        text NOT NULL,
  severity          text NOT NULL,
  resolved_at       timestamptz,
  resolved_by       uuid,
  resolution_note   text
);

GRANT SELECT ON public.settlement_drift_log TO authenticated;
GRANT UPDATE ON public.settlement_drift_log TO authenticated;
GRANT ALL ON public.settlement_drift_log TO service_role;

ALTER TABLE public.settlement_drift_log ENABLE ROW LEVEL SECURITY;

CREATE INDEX idx_settlement_drift_org_open
  ON public.settlement_drift_log (organization_id, detected_at DESC)
  WHERE resolved_at IS NULL;

CREATE UNIQUE INDEX idx_settlement_drift_unresolved_sale
  ON public.settlement_drift_log (sale_id)
  WHERE resolved_at IS NULL;

-- Org members can read their own org's drift rows
CREATE POLICY "Org members read own drift"
  ON public.settlement_drift_log
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.organization_members om
      WHERE om.organization_id = settlement_drift_log.organization_id
        AND om.user_id = auth.uid()
    )
    OR public.has_role(auth.uid(), 'platform_admin')
  );

-- Platform admin can mark rows resolved
CREATE POLICY "Platform admin resolves drift"
  ON public.settlement_drift_log
  FOR UPDATE
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'))
  WITH CHECK (public.has_role(auth.uid(), 'platform_admin'));

-- 2) Run log table
CREATE TABLE public.drift_detection_runs (
  id                uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  run_at            timestamptz NOT NULL DEFAULT now(),
  organization_id   uuid,
  orgs_scanned      integer NOT NULL DEFAULT 0,
  drifts_found      integer NOT NULL DEFAULT 0,
  critical_count    integer NOT NULL DEFAULT 0,
  duration_ms       integer,
  error             text
);

GRANT SELECT ON public.drift_detection_runs TO authenticated;
GRANT ALL ON public.drift_detection_runs TO service_role;

ALTER TABLE public.drift_detection_runs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Platform admin reads run log"
  ON public.drift_detection_runs
  FOR SELECT
  TO authenticated
  USING (public.has_role(auth.uid(), 'platform_admin'));

CREATE INDEX idx_drift_runs_recent
  ON public.drift_detection_runs (run_at DESC);

-- 3) Detection function
CREATE OR REPLACE FUNCTION public.detect_settlement_drift(p_organization_id uuid DEFAULT NULL)
RETURNS TABLE(org_id uuid, drifts_found integer)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_started_at timestamptz := clock_timestamp();
  v_total_drifts integer := 0;
  v_critical integer := 0;
  v_orgs_scanned integer := 0;
BEGIN
  -- Compute per-sale voucher totals and drift classification
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
      -- Evidence baseline: greater of vouchers vs tender (never sum)
      GREATEST(c.voucher_paid, c.tender) AS evidence_paid,
      -- Residual after paid + return
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
  -- Auto-resolve open rows that no longer drift
  auto_resolved AS (
    UPDATE public.settlement_drift_log l
    SET resolved_at = now(),
        resolution_note = 'auto-resolved: cache now matches vouchers'
    WHERE l.resolved_at IS NULL
      AND (p_organization_id IS NULL OR l.organization_id = p_organization_id)
      AND NOT EXISTS (SELECT 1 FROM drifting d WHERE d.sale_id = l.sale_id)
    RETURNING 1
  ),
  agg AS (
    SELECT
      organization_id,
      COUNT(*)::int AS n,
      COUNT(*) FILTER (WHERE severity = 'critical')::int AS n_crit
    FROM upserted
    GROUP BY organization_id
  )
  SELECT
    COALESCE(SUM(n), 0)::int,
    COALESCE(SUM(n_crit), 0)::int,
    COUNT(*)::int
  INTO v_total_drifts, v_critical, v_orgs_scanned
  FROM agg;

  -- Record run summary
  INSERT INTO public.drift_detection_runs (
    organization_id, orgs_scanned, drifts_found, critical_count, duration_ms
  )
  VALUES (
    p_organization_id,
    v_orgs_scanned,
    v_total_drifts,
    v_critical,
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int
  );

  RETURN QUERY
    SELECT a.organization_id, a.n
    FROM (
      SELECT l.organization_id, COUNT(*)::int AS n
      FROM public.settlement_drift_log l
      WHERE l.resolved_at IS NULL
        AND (p_organization_id IS NULL OR l.organization_id = p_organization_id)
      GROUP BY l.organization_id
    ) a;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO public.drift_detection_runs (
    organization_id, orgs_scanned, drifts_found, critical_count, duration_ms, error
  )
  VALUES (
    p_organization_id, 0, 0, 0,
    EXTRACT(MILLISECONDS FROM clock_timestamp() - v_started_at)::int,
    SQLERRM
  );
  RAISE;
END;
$$;

GRANT EXECUTE ON FUNCTION public.detect_settlement_drift(uuid) TO authenticated, service_role;
