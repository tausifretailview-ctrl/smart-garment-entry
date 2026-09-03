-- =============================================================================
-- ELLA NOOR — UZMA KUDIA advance reallocation repair (2026-09-03)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Tag: [uzma_adv_realloc_20260903]
-- =============================================================================
-- Symptom (ledger PDF 02-Sep-2026 vs Sales Invoice Dashboard):
--   Customer ledger Balance = ₹0 (correct account-level).
--   INV/26-27/2896 shows Partial / Balance ₹2,101 on the sales bill list.
--
-- Root cause (cash + advance over-settle on 2841 after discount):
--   INV/26-27/2841 net ₹19,149
--     cash RCP/26-27/4116          ₹4,149
--     advance RCP/26-27/4303      ₹17,101   → applied total ₹21,250 (+₹2,101)
--   INV/26-27/2896 net ₹17,300
--     advance RCP/26-27/4304      ₹10,899
--     cash RCP/26-27/4323          ₹4,300   → applied total ₹15,199 (−₹2,101)
--   Advance booking ADV/26-27/748 = ₹28,000 fully used (17,101 + 10,899).
--
-- Repair (reallocate ₹2,101 of advance from 2841 → 2896):
--   Soft-delete RCP/26-27/4303 (₹17,101).
--   Insert advance_adjustment ₹15,000 on 2841 (so cash+adv = net).
--   Insert advance_adjustment ₹2,101 on 2896 (so cash+adv = net).
--   Keep RCP/26-27/4304 (₹10,899) and cash receipts untouched.
--   Recompute customer_advances.used_amount; receipt sync updates paid_amount.
--
-- Rules:
--   1. Run SECTION 1 dry-run first; paste results; confirm GATE rows.
--   2. Hand-check both invoices + four RCP numbers against the ledger PDF.
--   3. SECTION 2 mutate is commented — uncomment only after review.
--   4. Soft-delete only; never hard-delete.
--   5. After COMMIT: run invariant digest / SECTION 3 verify.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1 — Dry-run (read-only)
-- -----------------------------------------------------------------------------

-- 1A Identity
SELECT c.id AS customer_id, c.customer_name, c.phone, c.organization_id, o.name AS org_name
FROM public.customers c
JOIN public.organizations o ON o.id = c.organization_id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND (
    upper(c.customer_name) LIKE '%UZMA%KUDIA%'
    OR c.phone LIKE '%7304448414%'
  );

-- 1B Sales snapshot
SELECT
  s.id AS sale_id,
  s.sale_number,
  s.net_amount,
  s.discount_amount,
  s.flat_discount_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.payment_status,
  s.customer_id,
  ROUND(
    GREATEST(
      0,
      COALESCE(s.net_amount, 0) - COALESCE(s.paid_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    )::numeric,
    2
  ) AS naive_outstanding
FROM public.sales s
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
  AND s.deleted_at IS NULL
ORDER BY s.sale_number;

-- 1C Live receipts on both invoices
SELECT
  s.sale_number,
  ve.id AS voucher_id,
  ve.voucher_number,
  ve.voucher_date,
  ve.payment_method,
  ve.total_amount,
  ve.discount_amount,
  ve.description,
  ve.deleted_at,
  ve.notes
FROM public.voucher_entries ve
JOIN public.sales s ON s.id = ve.reference_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
  AND ve.organization_id = s.organization_id
  AND ve.voucher_type = 'receipt'
ORDER BY s.sale_number, ve.created_at NULLS LAST, ve.voucher_number;

-- 1D Per-invoice settlement vs net (GATE)
WITH sales AS (
  SELECT id, sale_number, net_amount, customer_id
  FROM public.sales
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
    AND deleted_at IS NULL
),
splits AS (
  SELECT
    s.sale_number,
    s.id AS sale_id,
    s.net_amount,
    s.customer_id,
    COALESCE(SUM(ve.total_amount) FILTER (
      WHERE lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        AND ve.deleted_at IS NULL
    ), 0) AS advance_applied,
    COALESCE(SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)) FILTER (
      WHERE lower(COALESCE(ve.payment_method, '')) NOT IN (
        'advance_adjustment', 'credit_note_adjustment'
      )
        AND ve.deleted_at IS NULL
    ), 0) AS cash_like
  FROM sales s
  LEFT JOIN public.voucher_entries ve
    ON ve.reference_id = s.id
   AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
   AND ve.voucher_type = 'receipt'
  GROUP BY s.sale_number, s.id, s.net_amount, s.customer_id
)
SELECT
  sale_number,
  net_amount,
  cash_like,
  advance_applied,
  cash_like + advance_applied AS applied_total,
  ROUND((cash_like + advance_applied - net_amount)::numeric, 2) AS over_under,
  CASE
    WHEN sale_number = 'INV/26-27/2841'
     AND ABS(cash_like - 4149) <= 0.01
     AND ABS(advance_applied - 17101) <= 0.01
     AND ABS(cash_like + advance_applied - net_amount - 2101) <= 0.01
      THEN 'GATE_OK — 2841 over by ₹2,101'
    WHEN sale_number = 'INV/26-27/2896'
     AND ABS(cash_like - 4300) <= 0.01
     AND ABS(advance_applied - 10899) <= 0.01
     AND ABS(net_amount - (cash_like + advance_applied) - 2101) <= 0.01
      THEN 'GATE_OK — 2896 short by ₹2,101'
    ELSE 'GATE_FAIL — stop; numbers drifted'
  END AS gate
FROM splits
ORDER BY sale_number;

-- 1E Preview mutate actions
SELECT
  ve.id AS voucher_id,
  ve.voucher_number,
  s.sale_number,
  ve.total_amount AS before_amount,
  CASE
    WHEN ve.voucher_number = 'RCP/26-27/4303' THEN 'SOFT_DELETE (excess ₹17,101)'
    WHEN ve.voucher_number = 'RCP/26-27/4304' THEN 'KEEP'
    ELSE 'KEEP (cash)'
  END AS action
FROM public.voucher_entries ve
JOIN public.sales s ON s.id = ve.reference_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
  AND ve.organization_id = s.organization_id
  AND ve.voucher_type = 'receipt'
  AND ve.deleted_at IS NULL
  AND ve.voucher_number IN ('RCP/26-27/4303', 'RCP/26-27/4304', 'RCP/26-27/4116', 'RCP/26-27/4323')
ORDER BY ve.voucher_number;

SELECT
  'INSERT' AS action,
  'INV/26-27/2841' AS sale_number,
  15000::numeric AS amount,
  'advance_adjustment replacement after soft-delete of RCP/26-27/4303' AS note
UNION ALL
SELECT
  'INSERT',
  'INV/26-27/2896',
  2101::numeric,
  'advance_adjustment reallocation of ₹2,101 excess from 2841';


-- -----------------------------------------------------------------------------
-- SECTION 2 — Mutate (review SECTION 1 gates first; then uncomment & run)
-- -----------------------------------------------------------------------------
/*
BEGIN;

-- Resolve ids once
CREATE TEMP TABLE _uzma_fix ON COMMIT DROP AS
SELECT
  s.id AS sale_id,
  s.sale_number,
  s.net_amount,
  s.customer_id,
  s.organization_id,
  s.paid_amount AS old_paid,
  s.payment_status AS old_status
FROM public.sales s
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
  AND s.deleted_at IS NULL;

-- Expect exactly 2 rows
SELECT sale_number, sale_id, net_amount, old_paid, old_status FROM _uzma_fix ORDER BY 1;

-- Soft-delete the over-applied advance on 2841
UPDATE public.voucher_entries ve
SET
  deleted_at = NOW(),
  updated_at = NOW(),
  notes = trim(
    BOTH E'\n'
    FROM COALESCE(ve.notes, '')
      || E'\n[uzma_adv_realloc_20260903] soft-deleted ₹17,101 advance; reallocating ₹15,000 to INV/2841 and ₹2,101 to INV/2896'
  )
FROM _uzma_fix u
WHERE ve.id = (
  SELECT ve2.id
  FROM public.voucher_entries ve2
  WHERE ve2.organization_id = u.organization_id
    AND ve2.reference_id = u.sale_id
    AND ve2.voucher_number = 'RCP/26-27/4303'
    AND ve2.deleted_at IS NULL
  LIMIT 1
)
AND u.sale_number = 'INV/26-27/2841'
AND ve.deleted_at IS NULL;
-- Expect UPDATE 1

-- Insert replacement ₹15,000 advance on 2841
INSERT INTO public.voucher_entries (
  organization_id,
  voucher_type,
  voucher_number,
  voucher_date,
  reference_type,
  reference_id,
  total_amount,
  discount_amount,
  payment_method,
  description,
  notes,
  created_at,
  updated_at
)
SELECT
  u.organization_id,
  'receipt',
  public.generate_voucher_number('receipt', CURRENT_DATE),
  CURRENT_DATE,
  'sale',
  u.sale_id,
  15000,
  0,
  'advance_adjustment',
  'Adjusted from advance balance for invoice [uzma_adv_realloc_20260903] replacement for RCP/26-27/4303 (₹15,000)',
  '[uzma_adv_realloc_20260903] replacement advance ₹15,000 on INV/26-27/2841',
  NOW(),
  NOW()
FROM _uzma_fix u
WHERE u.sale_number = 'INV/26-27/2841';

-- Insert reallocated ₹2,101 advance on 2896
INSERT INTO public.voucher_entries (
  organization_id,
  voucher_type,
  voucher_number,
  voucher_date,
  reference_type,
  reference_id,
  total_amount,
  discount_amount,
  payment_method,
  description,
  notes,
  created_at,
  updated_at
)
SELECT
  u.organization_id,
  'receipt',
  public.generate_voucher_number('receipt', CURRENT_DATE),
  CURRENT_DATE,
  'sale',
  u.sale_id,
  2101,
  0,
  'advance_adjustment',
  'Adjusted from advance balance for invoice [uzma_adv_realloc_20260903] reallocated from INV/26-27/2841 excess',
  '[uzma_adv_realloc_20260903] reallocated advance ₹2,101 onto INV/26-27/2896',
  NOW(),
  NOW()
FROM _uzma_fix u
WHERE u.sale_number = 'INV/26-27/2896';

-- Recompute advance used (trigger should also fire; explicit belt-and-suspenders)
SELECT public.recompute_customer_advances_used(
  (SELECT organization_id FROM _uzma_fix LIMIT 1),
  (SELECT customer_id FROM _uzma_fix LIMIT 1)
);

UPDATE public.customer_advances ca
SET status = CASE
  WHEN COALESCE(ca.used_amount, 0) >= ca.amount - 0.01 AND ca.amount > 0 THEN 'fully_used'
  WHEN COALESCE(ca.used_amount, 0) > 0 THEN 'partially_used'
  ELSE 'active'
END
WHERE ca.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ca.customer_id = (SELECT customer_id FROM _uzma_fix LIMIT 1);

-- Force paid_amount / payment_status from settlement (in case trigger skipped)
UPDATE public.sales s
SET
  paid_amount = cs.new_paid,
  payment_status = cs.new_status,
  updated_at = NOW()
FROM _uzma_fix u
CROSS JOIN LATERAL public.compute_sale_settlement(u.sale_id, u.organization_id) cs
WHERE s.id = u.sale_id
  AND s.organization_id = u.organization_id
  AND (
    ABS(COALESCE(s.paid_amount, 0) - cs.new_paid) > 0.009
    OR COALESCE(s.payment_status, '') <> cs.new_status
  );

-- === VERIFY before COMMIT ===
SELECT
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.payment_status,
  COALESCE(SUM(ve.total_amount) FILTER (
    WHERE lower(ve.payment_method) = 'advance_adjustment' AND ve.deleted_at IS NULL
  ), 0) AS live_advance,
  COALESCE(SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)) FILTER (
    WHERE lower(ve.payment_method) NOT IN ('advance_adjustment', 'credit_note_adjustment')
      AND ve.deleted_at IS NULL
  ), 0) AS live_cash
FROM public.sales s
JOIN _uzma_fix u ON u.sale_id = s.id
LEFT JOIN public.voucher_entries ve
  ON ve.reference_id = s.id
 AND ve.organization_id = s.organization_id
 AND ve.voucher_type = 'receipt'
GROUP BY s.sale_number, s.net_amount, s.paid_amount, s.payment_status
ORDER BY 1;
-- Expect:
--   2841: advance 15000, cash 4149, paid completed, outstanding 0
--   2896: advance 13000, cash 4300, paid completed, outstanding 0

SELECT
  ROUND(SUM(ca.amount - COALESCE(ca.used_amount, 0))::numeric, 2) AS unused_advance,
  ROUND(SUM(COALESCE(ca.used_amount, 0))::numeric, 2) AS used_advance
FROM public.customer_advances ca
WHERE ca.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ca.customer_id = (SELECT customer_id FROM _uzma_fix LIMIT 1)
  AND ca.deleted_at IS NULL;
-- Expect: unused_advance = 0, used_advance = 28000

-- If verify fails:
-- ROLLBACK;

COMMIT;
*/


-- -----------------------------------------------------------------------------
-- SECTION 3 — Post-commit verify (run after COMMIT)
-- -----------------------------------------------------------------------------
SELECT
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.payment_status,
  cs.new_paid,
  cs.new_status,
  ROUND(GREATEST(0, s.net_amount - s.paid_amount - COALESCE(s.sale_return_adjust, 0))::numeric, 2)
    AS naive_outstanding
FROM public.sales s
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
  AND s.deleted_at IS NULL
ORDER BY 1;

SELECT ve.voucher_number, s.sale_number, ve.total_amount, ve.payment_method, ve.deleted_at IS NOT NULL AS is_deleted, ve.notes
FROM public.voucher_entries ve
JOIN public.sales s ON s.id = ve.reference_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_number IN ('INV/26-27/2841', 'INV/26-27/2896')
  AND (
    ve.voucher_number = 'RCP/26-27/4303'
    OR COALESCE(ve.notes, '') ILIKE '%uzma_adv_realloc_20260903%'
    OR COALESCE(ve.description, '') ILIKE '%uzma_adv_realloc_20260903%'
  )
ORDER BY ve.created_at;
