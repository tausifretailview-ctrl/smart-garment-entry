-- Phase 3: extend get_customer_ledger_anomalies with advance + discount drift checks

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
  null_ref_receipts_amount numeric,
  advance_drift_count bigint,
  advance_drift_amount numeric,
  discount_drift_count bigint,
  discount_drift_amount numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO public
AS $$
  WITH
  authz AS (
    SELECT 1
    WHERE EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'platform_admin'
    )
  ),
  orgs AS (
    SELECT id, name FROM public.organizations
  ),
  mistagged AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.total_amount), 0) AS amt
    FROM public.voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'customer'
      AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id::text = ve.reference_id::text)
    GROUP BY ve.organization_id
  ),
  sale_vouch AS (
    SELECT ve.organization_id,
           ve.reference_id AS sale_id,
           SUM(
             CASE
               WHEN COALESCE(ve.payment_method, '') <> 'advance_adjustment'
                 AND lower(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
               THEN ve.total_amount
               ELSE 0
             END
           ) AS non_adv,
           SUM(ve.total_amount) AS total
    FROM public.voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_id IS NOT NULL
    GROUP BY ve.organization_id, ve.reference_id
  ),
  paid_drift AS (
    SELECT s.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ABS(COALESCE(s.paid_amount, 0) - COALESCE(sv.non_adv, 0))), 0) AS amt
    FROM public.sales s
    LEFT JOIN sale_vouch sv
      ON sv.sale_id::text = s.id::text AND sv.organization_id = s.organization_id
    WHERE s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND ABS(COALESCE(s.paid_amount, 0) - COALESCE(sv.non_adv, 0)) > 1
    GROUP BY s.organization_id
  ),
  overpaid AS (
    SELECT s.organization_id,
           COUNT(*) AS cnt,
           COALESCE(
             SUM(COALESCE(sv.total, 0) - (COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0))),
             0
           ) AS amt
    FROM public.sales s
    JOIN sale_vouch sv ON sv.sale_id::text = s.id::text AND sv.organization_id = s.organization_id
    WHERE s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND COALESCE(sv.total, 0) - (COALESCE(s.net_amount, 0) - COALESCE(s.sale_return_adjust, 0)) > 1
    GROUP BY s.organization_id
  ),
  ghosts AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.total_amount), 0) AS amt
    FROM public.voucher_entries ve
    LEFT JOIN public.customers c ON c.id::text = ve.reference_id::text
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type = 'customer'
      AND NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.id::text = ve.reference_id::text)
      AND COALESCE(c.opening_balance, 0) = 0
    GROUP BY ve.organization_id
  ),
  null_ref AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.total_amount), 0) AS amt
    FROM public.voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_id IS NULL
    GROUP BY ve.organization_id
  ),
  advance_drift AS (
    SELECT ca_used.organization_id,
           COUNT(DISTINCT ca_used.customer_id) AS cnt,
           COALESCE(
             SUM(ABS(ca_used.total_used - COALESCE(va.voucher_adv_total, 0))),
             0
           ) AS amt
    FROM (
      SELECT organization_id, customer_id, SUM(used_amount) AS total_used
      FROM public.customer_advances
      GROUP BY organization_id, customer_id
    ) ca_used
    LEFT JOIN (
      SELECT s.organization_id,
             s.customer_id,
             SUM(ve.total_amount) AS voucher_adv_total
      FROM public.voucher_entries ve
      INNER JOIN public.sales s ON s.id::text = ve.reference_id::text
      WHERE ve.deleted_at IS NULL
        AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
        AND lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
      GROUP BY s.organization_id, s.customer_id
    ) va
      ON va.organization_id = ca_used.organization_id
     AND va.customer_id = ca_used.customer_id
    WHERE ABS(ca_used.total_used - COALESCE(va.voucher_adv_total, 0)) > 1
    GROUP BY ca_used.organization_id
  ),
  discount_drift AS (
    SELECT ve.organization_id,
           COUNT(*) AS cnt,
           COALESCE(SUM(ve.discount_amount), 0) AS amt
    FROM public.voucher_entries ve
    WHERE ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND COALESCE(ve.discount_amount, 0) > 0.01
      AND ve.total_amount > 0
      AND EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.id::text = ve.reference_id::text
          AND s.deleted_at IS NULL
          AND COALESCE(s.paid_amount, 0) > (
            SELECT COALESCE(
              SUM(v2.total_amount + COALESCE(v2.discount_amount, 0)),
              0
            )
            FROM public.voucher_entries v2
            WHERE v2.reference_id::text = s.id::text
              AND v2.deleted_at IS NULL
              AND v2.voucher_type = 'receipt'
          ) + 1
      )
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
    COALESCE(n.amt, 0) AS null_ref_receipts_amount,
    COALESCE(ad.cnt, 0) AS advance_drift_count,
    COALESCE(ad.amt, 0) AS advance_drift_amount,
    COALESCE(dd.cnt, 0) AS discount_drift_count,
    COALESCE(dd.amt, 0) AS discount_drift_amount
  FROM authz, orgs o
  LEFT JOIN mistagged m ON m.organization_id = o.id
  LEFT JOIN paid_drift p ON p.organization_id = o.id
  LEFT JOIN overpaid op ON op.organization_id = o.id
  LEFT JOIN ghosts g ON g.organization_id = o.id
  LEFT JOIN null_ref n ON n.organization_id = o.id
  LEFT JOIN advance_drift ad ON ad.organization_id = o.id
  LEFT JOIN discount_drift dd ON dd.organization_id = o.id
  ORDER BY o.name;
$$;

REVOKE EXECUTE ON FUNCTION public.get_customer_ledger_anomalies() FROM anon;
GRANT EXECUTE ON FUNCTION public.get_customer_ledger_anomalies() TO authenticated;
