-- =============================================================================
-- Hanif bhai — balance diagnostic + optional data tag (ELLA NOOR)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Symptom: Customer Balances shows ₹3,200 Dr; true position is ₹3,050 Cr.
-- Cause: SR/26-27/11 is credit_status='adjusted' — the balance RPC only counted
-- 'pending' returns, so the ₹3,050 remainder after CN apply was ignored.
--
-- PERMANENT FIX: deploy migration 20260822150000_fix_party_balance_adjusted_return_remainder.sql
-- =============================================================================

-- 1) Current state
SELECT
  c.customer_name,
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.payment_status,
  sr.return_number,
  sr.net_amount AS return_net,
  sr.credit_available_balance,
  sr.credit_status,
  public.get_customer_true_outstanding(c.id, c.organization_id) AS true_outstanding,
  pb.signed_balance AS party_balance_rpc
FROM public.customers c
LEFT JOIN public.sales s
  ON s.customer_id = c.id AND s.deleted_at IS NULL AND s.sale_number = 'INV/26-27/287'
LEFT JOIN public.sale_returns sr
  ON sr.customer_id = c.id AND sr.deleted_at IS NULL AND sr.return_number = 'SR/26-27/11'
LEFT JOIN LATERAL (
  SELECT signed_balance
  FROM public.get_customer_party_balances(c.organization_id)
  WHERE customer_id = c.id
  LIMIT 1
) pb ON true
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.customer_name ILIKE '%hanif bhai%'
  AND c.deleted_at IS NULL;


-- 2) Optional — tag return remainder (run after migration deploys, or alongside it)
UPDATE public.sale_returns sr
SET
  credit_available_balance = 3050,
  credit_status = 'partially_adjusted',
  updated_at = now()
FROM public.customers c
WHERE sr.customer_id = c.id
  AND c.customer_name ILIKE '%hanif bhai%'
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.return_number = 'SR/26-27/11'
  AND sr.deleted_at IS NULL;


-- 3) Verify after migration + optional tag
SELECT customer_name, signed_balance, direction, net_receivable
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_name ILIKE '%hanif%';
