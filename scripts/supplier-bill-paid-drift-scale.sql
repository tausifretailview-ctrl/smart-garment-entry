-- Dry-run scale check for purchase_bills paid_amount drift vs payment vouchers (cash + discount).
-- Run in Supabase SQL editor with service_role / postgres. Review counts before applying
-- supabase/migrations/20260915143000_supplier_bill_paid_voucher_sync_backfill.sql UPDATE.

WITH voucher_totals AS (
  SELECT
    v.reference_id AS bill_id,
    v.organization_id,
    SUM(COALESCE(v.total_amount, 0) + COALESCE(v.discount_amount, 0))::numeric(14, 2) AS voucher_settlement,
    BOOL_OR(COALESCE(v.discount_amount, 0) > 0.009) AS has_settlement_discount
  FROM public.voucher_entries v
  WHERE v.deleted_at IS NULL
    AND v.voucher_type = 'payment'
    AND v.reference_type = 'supplier'
    AND v.reference_id IS NOT NULL
  GROUP BY v.reference_id, v.organization_id
),
candidates AS (
  SELECT
    pb.id,
    pb.organization_id,
    o.name AS org_name,
    pb.software_bill_no,
    pb.supplier_invoice_no,
    s.name AS supplier_name,
    pb.net_amount,
    pb.paid_amount AS stored_paid,
    pb.payment_status AS stored_status,
    vt.voucher_settlement,
    vt.has_settlement_discount,
    LEAST(
      COALESCE(pb.net_amount, 0),
      GREATEST(COALESCE(pb.paid_amount, 0), COALESCE(vt.voucher_settlement, 0))
    )::numeric(14, 2) AS effective_paid
  FROM public.purchase_bills pb
  INNER JOIN voucher_totals vt
    ON vt.bill_id = pb.id
   AND vt.organization_id = pb.organization_id
  LEFT JOIN public.organizations o ON o.id = pb.organization_id
  LEFT JOIN public.suppliers s ON s.id = pb.supplier_id
  WHERE pb.deleted_at IS NULL
    AND COALESCE(pb.is_cancelled, false) = false
    AND COALESCE(vt.voucher_settlement, 0) > 0.01
)
SELECT
  COUNT(*) FILTER (
    WHERE ABS(COALESCE(stored_paid, 0) - effective_paid) > 0.009
  ) AS wrong_bill_count_all_orgs,
  COUNT(*) FILTER (
    WHERE has_settlement_discount
      AND ABS(COALESCE(stored_paid, 0) - effective_paid) > 0.009
  ) AS wrong_bill_count_discount_vouchers
FROM candidates;

-- Per-org breakdown
-- SELECT organization_id, org_name, COUNT(*) AS wrong_bills
-- FROM candidates
-- WHERE ABS(COALESCE(stored_paid, 0) - effective_paid) > 0.009
-- GROUP BY organization_id, org_name
-- ORDER BY wrong_bills DESC;
