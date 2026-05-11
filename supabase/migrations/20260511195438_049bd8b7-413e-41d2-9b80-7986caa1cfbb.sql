
-- Drop & recreate to allow signature changes
DROP FUNCTION IF EXISTS public.get_customer_ledger_anomalies();

CREATE OR REPLACE FUNCTION public.get_customer_ledger_anomalies()
RETURNS TABLE (
  organization_id uuid,
  organization_name text,
  mistagged_receipts_count bigint,
  mistagged_receipts_amount numeric,
  paid_drift_count bigint,
  paid_drift_amount numeric,
  overpaid_count bigint,
  overpaid_amount numeric,
  ghost_receipts_count bigint,
  ghost_receipts_amount numeric,
  null_ref_receipts_count bigint,
  null_ref_receipts_amount numeric
)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  WITH
  -- Only platform admins can see this — empty result for everyone else
  authz AS (
    SELECT 1
    WHERE EXISTS (
      SELECT 1 FROM user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'platform_admin'
    )
  ),
  orgs AS (
    SELECT id, name FROM organizations
  ),
  -- Mis-tagged: reference_type='customer' but reference_id IS a sales.id
  mistagged AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.total_amount), 0) AS amt
    FROM voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'customer'
      AND EXISTS (SELECT 1 FROM sales s WHERE s.id = ve.reference_id)
    GROUP BY ve.organization_id
  ),
  -- Per-sale non-advance voucher totals
  sale_vouch AS (
    SELECT ve.organization_id, ve.reference_id AS sale_id,
           SUM(CASE WHEN COALESCE(ve.payment_method,'') <> 'advance_adjustment'
                      AND LOWER(COALESCE(ve.description,'')) NOT LIKE '%adjusted from advance balance%'
                    THEN ve.total_amount ELSE 0 END) AS non_adv,
           SUM(ve.total_amount) AS total
    FROM voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_id IS NOT NULL
    GROUP BY ve.organization_id, ve.reference_id
  ),
  paid_drift AS (
    SELECT s.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ABS(COALESCE(s.paid_amount,0) - COALESCE(sv.non_adv,0))), 0) AS amt
    FROM sales s
    LEFT JOIN sale_vouch sv ON sv.sale_id = s.id AND sv.organization_id = s.organization_id
    WHERE s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND ABS(COALESCE(s.paid_amount,0) - COALESCE(sv.non_adv,0)) > 1
    GROUP BY s.organization_id
  ),
  overpaid AS (
    SELECT s.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(COALESCE(sv.total,0) - (COALESCE(s.net_amount,0) - COALESCE(s.sale_return_adjust,0))), 0) AS amt
    FROM sales s
    JOIN sale_vouch sv ON sv.sale_id = s.id AND sv.organization_id = s.organization_id
    WHERE s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND COALESCE(sv.total,0) - (COALESCE(s.net_amount,0) - COALESCE(s.sale_return_adjust,0)) > 1
    GROUP BY s.organization_id
  ),
  -- Ghost: reference_type='customer', not linked to any sale, customer opening=0
  ghosts AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.total_amount), 0) AS amt
    FROM voucher_entries ve
    LEFT JOIN customers c ON c.id = ve.reference_id
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'customer'
      AND NOT EXISTS (SELECT 1 FROM sales s WHERE s.id = ve.reference_id)
      AND COALESCE(c.opening_balance, 0) = 0
    GROUP BY ve.organization_id
  ),
  null_ref AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.total_amount), 0) AS amt
    FROM voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_id IS NULL
    GROUP BY ve.organization_id
  )
  SELECT
    o.id AS organization_id,
    o.name AS organization_name,
    COALESCE(m.cnt, 0) AS mistagged_receipts_count,
    COALESCE(m.amt, 0) AS mistagged_receipts_amount,
    COALESCE(p.cnt, 0) AS paid_drift_count,
    COALESCE(p.amt, 0) AS paid_drift_amount,
    COALESCE(op.cnt, 0) AS overpaid_count,
    COALESCE(op.amt, 0) AS overpaid_amount,
    COALESCE(g.cnt, 0) AS ghost_receipts_count,
    COALESCE(g.amt, 0) AS ghost_receipts_amount,
    COALESCE(n.cnt, 0) AS null_ref_receipts_count,
    COALESCE(n.amt, 0) AS null_ref_receipts_amount
  FROM authz, orgs o
  LEFT JOIN mistagged m  ON m.organization_id = o.id
  LEFT JOIN paid_drift p ON p.organization_id = o.id
  LEFT JOIN overpaid  op ON op.organization_id = o.id
  LEFT JOIN ghosts    g  ON g.organization_id = o.id
  LEFT JOIN null_ref  n  ON n.organization_id = o.id
  ORDER BY o.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_ledger_anomalies() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger_anomalies() TO authenticated;
