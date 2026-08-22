-- =============================================================================
-- ELLA NOOR — R5 paid_amount drift resync (Phase 1 batch)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Scope: invoices where sales.paid_amount ≠ compute_sale_settlement.new_paid
--        (Phase 1 §1B export: 11 rows, Aug 2026)
--
-- Rules:
--   • Dry-run section 1 first — review every before/after row
--   • Hand-check at least 5 rows against receipts before section 2
--   • Never hand-edit paid_amount — only compute_sale_settlement
--   • Non-regressive guards: no downgrade from completed; no paid reduction unless fully settled
--   • After COMMIT: run invariant digest (section 4)
--
-- Known targets from §1B export:
--   INV/25-26/585  KHADIJA SHEIKH      drift −₹21,000
--   INV/26-27/84   Aisha Moin Adhikari drift −₹12,000
--   INV/25-26/1193 SHEHNAZ HALAI       drift −₹10,490
--   INV/25-26/1233 Parveen Siddiqui    drift −₹9,450
--   INV/25-26/1314 Sana Rahil          drift −₹3,800
--   INV/26-27/1257 Amber khan          drift −₹3,050
--   INV/26-27/2423 Faiza Adil          drift +₹2,200 (paid includes SRA)
--   INV/26-27/2106 JASMIN DHEBAR       drift −₹500
--   INV/26-27/2105 NIHAD NAJEEB        drift −₹150
--   INV/26-27/2067 NAFISA              drift −₹100
--   INV/26-27/1842 ZAINAB SAYED        drift −₹100
-- =============================================================================

-- -----------------------------------------------------------------------------
-- SECTION 1 — Dry-run (read-only): every row that would change
-- -----------------------------------------------------------------------------
WITH drift AS (
  SELECT
    s.id AS sale_id,
    s.sale_number,
    c.customer_name,
    s.payment_status AS old_status,
    s.paid_amount AS old_paid,
    s.net_amount,
    s.sale_return_adjust,
    cs.new_paid,
    cs.new_status,
    ROUND(s.paid_amount - cs.new_paid, 2) AS drift_amount,
    ABS(s.paid_amount - cs.new_paid) > 0.009 AS paid_would_change,
    COALESCE(s.payment_status, '') <> cs.new_status AS status_would_change,
    CASE
      WHEN COALESCE(s.payment_status, '') = 'completed' AND cs.new_status <> 'completed'
        THEN 'BLOCKED — would downgrade completed'
      WHEN cs.new_paid < COALESCE(s.paid_amount, 0) - 0.009 AND cs.new_status <> 'completed'
        THEN 'BLOCKED — would reduce paid without full settlement'
      WHEN ABS(s.paid_amount - cs.new_paid) <= 0.009
        AND COALESCE(s.payment_status, '') = cs.new_status
        THEN 'SKIP — already aligned'
      ELSE 'APPLY'
    END AS repair_action
  FROM public.sales s
  JOIN public.customers c ON c.id = s.customer_id
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND ABS(s.paid_amount - cs.new_paid) > 0.99
)
SELECT *
FROM drift
ORDER BY ABS(drift_amount) DESC;


-- -----------------------------------------------------------------------------
-- SECTION 2 — Repair (single transaction). Review section 1 first.
-- -----------------------------------------------------------------------------
/*
BEGIN;

WITH targets AS (
  SELECT
    s.id,
    s.sale_number,
    s.paid_amount AS old_paid,
    s.payment_status AS old_status,
    c.new_paid,
    c.new_status
  FROM public.sales s
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
    AND ABS(s.paid_amount - c.new_paid) > 0.99
    AND c.new_paid IS NOT NULL
    -- Non-regressive guards (same as 20260709120000 bulk resync)
    AND NOT (COALESCE(s.payment_status, '') = 'completed' AND c.new_status <> 'completed')
    AND NOT (c.new_paid < COALESCE(s.paid_amount, 0) - 0.009 AND c.new_status <> 'completed')
),
updated AS (
  UPDATE public.sales s
  SET
    paid_amount = t.new_paid,
    payment_status = t.new_status,
    notes = COALESCE(s.notes, '') ||
      E'\n[r5_paid_drift_resync_20260822] paid ' ||
      COALESCE(t.old_paid::text, '0') || ' → ' || t.new_paid::text ||
      '; status ' || COALESCE(t.old_status, '') || ' → ' || t.new_status,
    updated_at = now()
  FROM targets t
  WHERE s.id = t.id
  RETURNING
    s.sale_number,
    t.old_paid,
    t.new_paid,
    t.old_status,
    t.new_status
)
SELECT * FROM updated ORDER BY ABS(COALESCE(old_paid, 0) - new_paid) DESC;

-- Post-repair state inside transaction (expect 0 drift rows)
SELECT
  s.sale_number,
  c.customer_name,
  s.paid_amount,
  cs.new_paid,
  s.payment_status,
  cs.new_status,
  ROUND(s.paid_amount - cs.new_paid, 2) AS remaining_drift
FROM public.sales s
JOIN public.customers c ON c.id = s.customer_id
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.deleted_at IS NULL
  AND s.notes ILIKE '%r5_paid_drift_resync_20260822%'
ORDER BY s.sale_number;

COMMIT;
-- ROLLBACK;
*/


-- -----------------------------------------------------------------------------
-- SECTION 3 — Verify (read-only, run after COMMIT)
-- -----------------------------------------------------------------------------
SELECT
  s.sale_number,
  c.customer_name,
  s.paid_amount AS recorded_paid,
  cs.new_paid AS expected_paid,
  s.payment_status,
  cs.new_status,
  ROUND(s.paid_amount - cs.new_paid, 2) AS drift
FROM public.sales s
JOIN public.customers c ON c.id = s.customer_id
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) cs
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
  AND ABS(s.paid_amount - cs.new_paid) > 0.99
ORDER BY ABS(s.paid_amount - cs.new_paid) DESC;


-- -----------------------------------------------------------------------------
-- SECTION 4 — Invariant digest (expect paid_diverges_from_receipts count ↓)
-- Run via Edge Function run-invariant-digest or platform admin tooling.
-- Spot-check:
-- -----------------------------------------------------------------------------
SELECT
  i.entity_ref AS sale_number,
  i.detail AS recorded_minus_expected,
  s.paid_amount,
  c.new_paid
FROM public.v_accounting_invariants i
JOIN public.sales s ON s.id = i.entity_id
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
WHERE i.check_name = 'paid_diverges_from_receipts'
  AND i.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY abs(i.detail) DESC
LIMIT 20;
