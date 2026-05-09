-- Supplier payment audit / reconciliation helpers and forward-compat for partial CN on purchase returns.

-- Optional column for partial credit-note remainder (Phase 2 UI; safe no-op until used)
ALTER TABLE public.purchase_returns
  ADD COLUMN IF NOT EXISTS credit_available_balance NUMERIC;

COMMENT ON COLUMN public.purchase_returns.credit_available_balance IS
  'Remaining supplier CN amount when partially applied to a bill (mirrors sale_returns pattern). NULL means use net_amount.';

UPDATE public.purchase_returns
SET credit_available_balance = net_amount
WHERE credit_available_balance IS NULL
  AND deleted_at IS NULL
  AND (credit_status IS NULL OR credit_status = 'pending');

-- Bills: paid_amount vs sum of bill-linked payment vouchers (flags sync drift when vouchers exist)
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
  SELECT reference_id, SUM(total_amount) AS sum_pay
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
  'purchase_bills where paid_amount differs from sum of payment vouchers referencing the bill id (voucher sum > 0). At-purchase-only payments may show 0 voucher sum and are excluded.';

-- Purchase returns adjusted against a bill with linked CN voucher (manual review / integrity)
CREATE OR REPLACE VIEW public.supplier_cn_bill_integrity_check AS
SELECT
  pr.id                    AS purchase_return_id,
  pr.organization_id,
  pr.supplier_id,
  pr.return_number,
  pr.net_amount            AS return_net_amount,
  pr.credit_status,
  pr.linked_bill_id,
  pr.credit_note_id,
  ve.total_amount          AS cn_voucher_amount,
  ve.voucher_number        AS cn_voucher_number,
  pb.software_bill_no,
  pb.net_amount            AS bill_net_amount,
  pb.paid_amount           AS bill_paid_amount
FROM purchase_returns pr
LEFT JOIN voucher_entries ve
  ON ve.id = pr.credit_note_id
  AND ve.deleted_at IS NULL
LEFT JOIN purchase_bills pb
  ON pb.id = pr.linked_bill_id
  AND pb.deleted_at IS NULL
WHERE pr.deleted_at IS NULL
  AND pr.credit_status = 'adjusted'
  AND pr.linked_bill_id IS NOT NULL;

COMMENT ON VIEW public.supplier_cn_bill_integrity_check IS
  'Purchase returns fully adjusted against a specific bill, with CN voucher and bill snapshot. Use for auditing Adjust Credit Note (bill) flow.';
