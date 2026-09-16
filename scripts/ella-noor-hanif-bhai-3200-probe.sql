-- Hanif bhai ELLA NOOR — run one statement at a time.
-- Customer 00c34380-3602-406d-b9a0-d378a20f7b9c
-- Org 3fdca631-1e0c-4417-9704-421f5129ff67

SELECT
  sr.return_number,
  sr.net_amount,
  sr.credit_status,
  sr.credit_available_balance,
  sr.refund_type,
  sr.linked_sale_id,
  sr.credit_note_id
FROM public.sale_returns sr
WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.customer_id = '00c34380-3602-406d-b9a0-d378a20f7b9c'
  AND sr.deleted_at IS NULL;

SELECT
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.payment_status,
  s.is_cancelled
FROM public.sales s
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.customer_id = '00c34380-3602-406d-b9a0-d378a20f7b9c'
  AND s.deleted_at IS NULL
ORDER BY s.sale_date;

SELECT
  ve.voucher_number,
  ve.voucher_type,
  ve.payment_method,
  ve.total_amount,
  ve.deleted_at,
  ve.description
FROM public.voucher_entries ve
WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND (
    ve.reference_id::text = '00c34380-3602-406d-b9a0-d378a20f7b9c'
    OR ve.reference_id IN (
      SELECT s.id FROM public.sales s
      WHERE s.customer_id = '00c34380-3602-406d-b9a0-d378a20f7b9c'
        AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    )
  )
ORDER BY ve.voucher_date;

SELECT
  rem.sale_return_id,
  rem.remaining
FROM public._org_sale_return_balance_remaining(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
) rem
WHERE rem.out_customer_id = '00c34380-3602-406d-b9a0-d378a20f7b9c';

SELECT source, amount, detail
FROM public.reconcile_customer_balance(
  '00c34380-3602-406d-b9a0-d378a20f7b9c'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
);
