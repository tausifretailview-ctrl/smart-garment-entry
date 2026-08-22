-- =============================================================================
-- Sharmin Mewara — balance diagnostic (ELLA NOOR)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Symptom: Party balance shows ₹11,500 Cr after 28-row CN false-positive repair.
-- Repair row: RCP-00714 / voucher_id 0aef31d3-aa50-431e-862f-0df401d29434
--             CN ₹11,300 on INV/26-27/397 (post-repair: paid ₹12,300, SRA ₹0).
--
-- Likely cause: linked sale return still carries full credit_available_balance
-- because step 3c only runs when credit_status='adjusted' AND linked_sale_id
-- matches; if the return pool was not updated, balance RPC counts full return net.
--
-- Run sections 1–5 read-only. Section 6 is optional fix — review output first.
-- =============================================================================

-- 0) Customer id
SELECT id AS customer_id, customer_name, opening_balance
FROM public.customers
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND customer_name = 'Sharmin Mewara'
  AND deleted_at IS NULL;


-- 1) Party balance (same RPC as Customer Balances page)
SELECT customer_name, signed_balance, direction, net_receivable
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_name = 'Sharmin Mewara';


-- 2) Target invoice from bulk repair
SELECT
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.credit_applied,
  s.payment_status,
  s.net_amount - s.paid_amount - COALESCE(s.sale_return_adjust, 0) AS invoice_remaining,
  s.id AS sale_id
FROM public.sales s
JOIN public.customers c ON c.id = s.customer_id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.customer_name = 'Sharmin Mewara'
  AND s.deleted_at IS NULL
  AND s.sale_number = 'INV/26-27/397';


-- 3) CN-adjust receipts on that invoice (active + deleted)
SELECT
  ve.voucher_number,
  ve.id,
  ve.total_amount,
  ve.payment_method,
  ve.deleted_at IS NOT NULL AS is_deleted,
  LEFT(COALESCE(ve.notes, ''), 120) AS notes_preview,
  ve.description
FROM public.voucher_entries ve
JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.customers c ON c.id = s.customer_id
WHERE c.customer_name = 'Sharmin Mewara'
  AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number = 'INV/26-27/397'
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
ORDER BY ve.deleted_at NULLS FIRST, ve.voucher_number;


-- 4) All sale returns for Sharmin — remainder math used by balance RPC
SELECT
  sr.return_number,
  sr.id AS sale_return_id,
  sr.net_amount,
  sr.credit_available_balance,
  sr.credit_status,
  sr.linked_sale_id,
  ls.sale_number AS linked_sale_number,
  COALESCE(ls.sale_return_adjust, 0) AS linked_invoice_sra,
  public._sale_return_remaining_credit_for_balance(
    sr.net_amount,
    sr.credit_available_balance,
    COALESCE(ls.sale_return_adjust, 0)
  ) AS balance_rpc_row_credit,
  sr.net_amount - 11300 AS expected_remainder_if_cn_11300
FROM public.sale_returns sr
JOIN public.customers c ON c.id = sr.customer_id
LEFT JOIN public.sales ls
  ON ls.id = sr.linked_sale_id
 AND ls.organization_id = sr.organization_id
 AND ls.deleted_at IS NULL
WHERE c.customer_name = 'Sharmin Mewara'
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
ORDER BY sr.return_date DESC NULLS LAST, sr.return_number;


-- 5) Balance breakdown (reconcile lines — may require authenticated session)
SELECT r.source, r.amount, r.detail
FROM public.customers c
CROSS JOIN LATERAL public.reconcile_customer_balance(c.id, c.organization_id) r
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.customer_name = 'Sharmin Mewara'
  AND c.deleted_at IS NULL
ORDER BY r.source;


-- 5b) Manual balance components (works in SQL editor without auth)
WITH cust AS (
  SELECT c.id, c.customer_name, COALESCE(c.opening_balance, 0) AS opening_balance
  FROM public.customers c
  WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND c.customer_name = 'Sharmin Mewara'
    AND c.deleted_at IS NULL
)
SELECT
  'opening_balance' AS component,
  cust.opening_balance AS amount
FROM cust
UNION ALL
SELECT 'total_invoiced', COALESCE(SUM(s.net_amount), 0)
FROM cust
JOIN public.sales s ON s.customer_id = cust.id AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
UNION ALL
SELECT 'sale_return_adjust_total', COALESCE(SUM(s.sale_return_adjust), 0)
FROM cust
JOIN public.sales s ON s.customer_id = cust.id AND s.deleted_at IS NULL
UNION ALL
SELECT 'return_credit_total (RPC helper)',
  -public._customer_sale_return_credit_total(cust.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
FROM cust
UNION ALL
SELECT 'cash_receipts_non_cn', COALESCE(SUM(
  GREATEST(0, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
), 0)
FROM cust
JOIN public.sales s ON s.customer_id = cust.id AND s.deleted_at IS NULL
JOIN public.voucher_entries ve ON ve.reference_id = s.id
  AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ve.deleted_at IS NULL
  AND LOWER(COALESCE(ve.voucher_type, '')) = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) NOT IN ('credit_note_adjustment', 'advance_adjustment');


-- =============================================================================
-- 6) OPTIONAL FIX — only after sections 4–5 confirm stale return pool
-- =============================================================================
-- Scenario A: Return linked to INV/26-27/397, CN ₹11,300 applied, invoice paid
-- in cash (SRA stayed 0). Return net ₹11,500 → remainder ₹200.
--
-- Uncomment and adjust return_number after verifying section 4 output:

/*
UPDATE public.sale_returns sr
SET
  credit_available_balance = GREATEST(
    0,
    ROUND(COALESCE(sr.net_amount, 0) - 11300, 2)
  ),
  credit_status = CASE
    WHEN COALESCE(sr.net_amount, 0) - 11300 <= 0.5 THEN 'adjusted'
    ELSE 'partially_adjusted'
  END,
  notes = COALESCE(sr.notes, '') ||
    E'\n[sharmin_return_pool_fix_20260822] CN ₹11,300 on INV/26-27/397; remainder after apply',
  updated_at = now()
FROM public.customers c
WHERE sr.customer_id = c.id
  AND c.customer_name = 'Sharmin Mewara'
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND sr.return_number = '<RETURN_NUMBER_FROM_SECTION_4>'
  AND sr.linked_sale_id = (
    SELECT s.id FROM public.sales s
    WHERE s.sale_number = 'INV/26-27/397'
      AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND s.deleted_at IS NULL
  );
*/

-- 7) Verify after optional fix
SELECT customer_name, signed_balance, direction
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_name = 'Sharmin Mewara';
