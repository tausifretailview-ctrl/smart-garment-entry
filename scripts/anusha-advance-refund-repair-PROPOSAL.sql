-- =============================================================================
-- ANUSHA PATHAN — advance_refunds repair PROPOSAL (human judgement required)
-- =============================================================================
-- Customer: ANUSHA PATHAN  4751fce3-6453-49c1-bd16-e11ea2a67ee2
-- Phone:    9929511154
-- Org:      ELLA NOOR
--
-- Context (Phase 0 = Branch B):
--   Ledger PDF shows two Adv Refund lines: ₹5,450 + ₹5,450 = ₹10,900 (ARF*).
--   customer_advances: total ₹32,250 / used ₹29,800 → booking unused ₹2,450.
--   Those refunds cannot coexist with the booking figures (see
--   docs/phase0-anusha-advance-refund.md). DO NOT auto-run the mutate block.
--
-- Expected after a correct repair (if both rows are phantom):
--   Unused Advance strip → ₹2,450
--   Net position         → ₹2,450 Cr (invoice outstanding already ₹0)
--
-- IMPORTANT — used_amount interaction:
--   createAdvanceRefund() bumps customer_advances.used_amount by the refund.
--   Verified used total (₹29,800) already equals invoice advance applications,
--   so these ARF rows were likely inserted WITHOUT a used bump (or used was
--   later aligned to applications). Preflight GATE B must confirm before mutate.
-- =============================================================================


-- ═══════════════════════════════════════════════════════
-- PHASE 0 — READ ONLY (run & paste results before any write)
-- ═══════════════════════════════════════════════════════

-- P0.1 Identify customer + org
SELECT c.id AS customer_id, c.customer_name, c.phone, c.organization_id, o.name AS org_name
FROM public.customers c
JOIN public.organizations o ON o.id = c.organization_id
WHERE c.id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2';


-- P0.2 Advances (booking truth)
SELECT
  ca.id,
  ca.advance_number,
  ca.amount,
  ca.used_amount,
  ca.amount - ca.used_amount AS remaining_booking,
  ca.status,
  ca.advance_date,
  ca.deleted_at
FROM public.customer_advances ca
WHERE ca.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
ORDER BY ca.advance_date, ca.created_at;


-- P0.3 Candidate refund rows (+ linked voucher / journal)
SELECT
  ar.id AS refund_id,
  ar.advance_id,
  ca.advance_number,
  ar.refund_amount,
  ar.refund_date,
  ar.refund_number,
  ar.payment_method,
  ar.reason,
  ar.voucher_entry_id,
  ar.created_at,
  ar.created_by,
  ve.voucher_number,
  ve.voucher_date,
  ve.total_amount AS voucher_amount,
  ve.deleted_at AS voucher_deleted_at,
  ve.description AS voucher_description,
  je.id AS journal_entry_id,
  je.entry_number AS journal_entry_number
FROM public.advance_refunds ar
JOIN public.customer_advances ca ON ca.id = ar.advance_id
LEFT JOIN public.voucher_entries ve ON ve.id = ar.voucher_entry_id
LEFT JOIN public.journal_entries je
  ON je.organization_id = ar.organization_id
 AND je.reference_type = 'CustomerAdvanceRefund'
 AND je.reference_id = ar.id
 AND je.deleted_at IS NULL
WHERE ca.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
ORDER BY ar.refund_date, ar.created_at;


-- P0.4 Sum check (what the strip will show)
SELECT
  COALESCE(SUM(ca.amount), 0) AS advance_total,
  COALESCE(SUM(ca.used_amount), 0) AS used_total,
  COALESCE((
    SELECT SUM(ar.refund_amount)
    FROM public.advance_refunds ar
    JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
    WHERE ca2.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
  ), 0) AS refund_total,
  COALESCE(SUM(ca.amount), 0) - COALESCE(SUM(ca.used_amount), 0) AS unused_booking_only,
  GREATEST(
    0,
    COALESCE(SUM(ca.amount), 0)
      - COALESCE(SUM(ca.used_amount), 0)
      - COALESCE((
          SELECT SUM(ar.refund_amount)
          FROM public.advance_refunds ar
          JOIN public.customer_advances ca2 ON ca2.id = ar.advance_id
          WHERE ca2.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
        ), 0)
  ) AS unused_after_refunds
FROM public.customer_advances ca
WHERE ca.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
  AND ca.deleted_at IS NULL;


-- P0.5 Advance applications on invoices (should ≈ used_total ₹29,800)
SELECT
  ve.id,
  ve.voucher_number,
  ve.voucher_date,
  ve.total_amount,
  ve.payment_method,
  ve.reference_id AS sale_id,
  ve.description
FROM public.voucher_entries ve
WHERE ve.reference_type IN ('sale', 'SALE')
  AND ve.payment_method = 'advance_adjustment'
  AND ve.deleted_at IS NULL
  AND ve.reference_id IN (
    SELECT s.id FROM public.sales s
    WHERE s.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
      AND s.deleted_at IS NULL
  )
ORDER BY ve.voucher_date, ve.created_at;


-- ═══════════════════════════════════════════════════════
-- GATES (human) — all must pass before mutate
-- ═══════════════════════════════════════════════════════
-- GATE A — Rows match the phantom profile:
--   Exactly two active refunds totalling ₹10,900 (typically ₹5,450 each),
--   dates ~13/04/26 and ~26/05/26, ARF* numbers, and amounts that do NOT
--   match any advance's remaining_booking at booking time.
--
-- GATE B — used_amount already equals invoice advance_adjustment sum
--   (± ₹0.50). If used_total ≈ applications AND used_total + refund_total
--   would exceed advance_total, the refunds did NOT bump used_amount →
--   mutate must NOT reduce used_amount.
--   If used_total ≈ applications + refunds, use the "WITH used reverse"
--   variant instead (mirrors deleteAdvanceRefund in advanceRefundService.ts).
--
-- GATE C — No evidence of real cash paid out for these ARFs
--   (bank/cash tally, customer confirmation, matching payment proof).
--   If cash really left the till, STOP — this is not a phantom.
--
-- GATE D — Capture refund_id / voucher_entry_id / journal_entry_id from P0.3
--   into the CTE below before enabling the mutate block.


-- ═══════════════════════════════════════════════════════
-- PHASE 1 — MUTATE (COMMENTED OUT — enable only after gates)
-- Variant: refunds did NOT bump used_amount (expected for Anusha)
-- =============================================================================
-- BEGIN;
--
-- -- Paste ids from P0.3 into this CTE (do not use amount-only matching in prod).
-- WITH targets AS (
--   SELECT * FROM (VALUES
--     ('________-____-____-____-____________'::uuid),  -- refund_id #1
--     ('________-____-____-____-____________'::uuid)   -- refund_id #2
--   ) AS t(refund_id)
-- ),
-- locked AS (
--   SELECT ar.*
--   FROM public.advance_refunds ar
--   JOIN targets t ON t.refund_id = ar.id
--   JOIN public.customer_advances ca ON ca.id = ar.advance_id
--   WHERE ca.customer_id = '4751fce3-6453-49c1-bd16-e11ea2a67ee2'
--   FOR UPDATE OF ar
-- )
-- SELECT refund_id, advance_id, refund_amount, voucher_entry_id
-- FROM locked;   -- sanity: expect 2 rows, sum refund_amount = 10900
--
-- -- Soft-delete linked payment vouchers (ARF)
-- UPDATE public.voucher_entries ve
-- SET deleted_at = now()
-- WHERE ve.id IN (
--   SELECT ar.voucher_entry_id
--   FROM public.advance_refunds ar
--   WHERE ar.id IN (
--     '________-____-____-____-____________'::uuid,
--     '________-____-____-____-____________'::uuid
--   )
--   AND ar.voucher_entry_id IS NOT NULL
-- )
-- AND ve.deleted_at IS NULL;
--
-- -- Soft-delete GL journals if accounting engine wrote them
-- UPDATE public.journal_entries je
-- SET deleted_at = now()
-- WHERE je.reference_type = 'CustomerAdvanceRefund'
--   AND je.reference_id IN (
--     '________-____-____-____-____________',
--     '________-____-____-____-____________'
--   )
--   AND je.deleted_at IS NULL;
--
-- -- Hard-delete refund rows (table has no deleted_at)
-- DELETE FROM public.advance_refunds
-- WHERE id IN (
--   '________-____-____-____-____________'::uuid,
--   '________-____-____-____-____________'::uuid
-- );
--
-- -- Do NOT touch customer_advances.used_amount under GATE B (no-bump path).
--
-- -- Post-check (same session): unused_after_refunds should be 2450
-- -- Re-run P0.4 here, then COMMIT or ROLLBACK.
-- -- COMMIT;
-- -- ROLLBACK;


-- ═══════════════════════════════════════════════════════
-- PHASE 1b — ALTERNATE (only if GATE B says used WAS bumped)
-- Mirrors deleteAdvanceRefund(): reverse used per advance, then delete.
-- =============================================================================
-- BEGIN;
-- -- For each refund_id from P0.3:
-- --   UPDATE customer_advances
-- --     SET used_amount = GREATEST(0, used_amount - refund_amount),
-- --         status = <derive from amount/used>
-- --     WHERE id = advance_id;
-- -- Then same voucher / journal / DELETE advance_refunds as Phase 1.
-- -- Prefer calling the app helper deleteAdvanceRefund per id from a
-- -- service-role script if both bumps and journals need exact reversal.
-- ROLLBACK;
