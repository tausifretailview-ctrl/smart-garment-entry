-- One-time heal: align purchase_bills.paid_amount/payment_status with bill-linked payment
-- vouchers (cash + settlement discount). Same math as syncPurchaseBillPaymentFromVouchers.
-- Dry-run: scripts/supplier-bill-paid-drift-scale.sql

WITH voucher_totals AS (
  SELECT
    v.reference_id AS bill_id,
    SUM(COALESCE(v.total_amount, 0) + COALESCE(v.discount_amount, 0))::numeric(14, 2) AS voucher_settlement
  FROM public.voucher_entries v
  WHERE v.deleted_at IS NULL
    AND v.voucher_type = 'payment'
    AND v.reference_type = 'supplier'
    AND v.reference_id IS NOT NULL
  GROUP BY v.reference_id
),
healed AS (
  SELECT
    pb.id,
    pb.net_amount,
    LEAST(
      COALESCE(pb.net_amount, 0),
      GREATEST(COALESCE(pb.paid_amount, 0), COALESCE(vt.voucher_settlement, 0))
    )::numeric(14, 2) AS new_paid
  FROM public.purchase_bills pb
  LEFT JOIN voucher_totals vt ON vt.bill_id = pb.id
  WHERE pb.deleted_at IS NULL
    AND COALESCE(pb.is_cancelled, false) = false
)
UPDATE public.purchase_bills pb
SET
  paid_amount = h.new_paid,
  payment_status = CASE
    WHEN h.new_paid >= COALESCE(h.net_amount, 0) - 0.01 THEN 'paid'
    WHEN h.new_paid > 0.01 THEN 'partial'
    ELSE 'unpaid'
  END
FROM healed h
WHERE pb.id = h.id
  AND (
    ABS(COALESCE(pb.paid_amount, 0) - h.new_paid) > 0.009
    OR pb.payment_status IS DISTINCT FROM (
      CASE
        WHEN h.new_paid >= COALESCE(h.net_amount, 0) - 0.01 THEN 'paid'
        WHEN h.new_paid > 0.01 THEN 'partial'
        ELSE 'unpaid'
      END
    )
  );

-- Fix audit view: include settlement discount on payment vouchers
CREATE OR REPLACE VIEW public.supplier_bill_payment_voucher_drift AS
SELECT
  pb.id                    AS bill_id,
  pb.organization_id,
  pb.supplier_id,
  pb.software_bill_no,
  pb.supplier_invoice_no,
  pb.net_amount,
  pb.paid_amount           AS bill_paid_amount,
  COALESCE(v.sum_pay, 0)  AS voucher_payments_sum,
  pb.paid_amount - COALESCE(v.sum_pay, 0) AS drift_amount
FROM purchase_bills pb
LEFT JOIN (
  SELECT
    reference_id,
    SUM(COALESCE(total_amount, 0) + COALESCE(discount_amount, 0)) AS sum_pay
  FROM voucher_entries
  WHERE reference_type = 'supplier'
    AND voucher_type = 'payment'
    AND deleted_at IS NULL
  GROUP BY reference_id
) v ON v.reference_id = pb.id
WHERE pb.deleted_at IS NULL
  AND (pb.is_cancelled IS NULL OR pb.is_cancelled = false)
  AND COALESCE(v.sum_pay, 0) > 0.01
  AND ABS(pb.paid_amount - COALESCE(v.sum_pay, 0)) > 0.50;

COMMENT ON VIEW public.supplier_bill_payment_voucher_drift IS
  'purchase_bills where paid_amount differs from sum of bill-linked payment vouchers '
  '(cash + settlement discount). At-purchase-only payments may show 0 voucher sum and are excluded.';
