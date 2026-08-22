-- =============================================================================
-- ELLA NOOR — Restore false-positive deleted CN-adjust receipts
-- =============================================================================
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
--
-- STANDALONE: does NOT require migration 20260822120000 (cn_false_positive_deleted_receipts
-- view). Run each section separately in Supabase SQL editor.
--
-- ROOT CAUSE (read-only investigation, Aug 2026):
--   On 06-Jun-2026 the cn_over_apply_repair_20260606 batch soft-deleted 28
--   credit_note_adjustment receipts. It assumed returns with credit_status='adjusted'
--   + linked_sale_id were already absorbed into the invoice at billing. For 11 of
--   those receipts the linked sale has sale_return_adjust = 0 — the deletion was
--   a false positive. Users did NOT delete these receipts manually.
--
--   Hanif bhai example:
--     SR/26-27/11  ₹6,250 return (credit_status=adjusted, linked INV/26-27/287)
--     INV/26-27/287 ₹3,200 invoice — sale_return_adjust=0, shows ₹3,200 Dr
--     RCP/26-27/330  ₹3,200 CN receipt — soft-deleted by repair
--     True net position: ₹3,050 Cr (₹6,250 return − ₹3,200 applied)
--
-- BEFORE RUNNING:
--   1. Run SECTION 1 (dry-run) and review every row.
--   2. For customers with a remainder (return net > CN applied), confirm with the
--      shop whether the remainder was paid out in cash (record refund) or is still
--      owed as credit. Hanif ₹3,050 / Arezah ₹3,150 / GULNAZ ₹750 / FIZA ₹200.
--   3. Do NOT use Recycle Bin "Restore" — it undeletes the voucher without setting
--      sales.sale_return_adjust, which leaves the invoice stuck unpaid.
-- =============================================================================

-- Inline detection (same logic as cn_false_positive_deleted_receipts view).
-- Reused in every section below so this script runs before that migration ships.
--
--   false_positive_fp AS (
--     SELECT ve.id AS voucher_id, ve.reference_id AS sale_id, ...
--     FROM voucher_entries ve JOIN sales s ...
--     WHERE ve.deleted_at IS NOT NULL AND s.sale_return_adjust < 0.5 AND repair tags
--   )


-- ═══════════════════════════════════════════════════════
-- SECTION 0 (optional) — Create detection view for ongoing monitoring
-- Skip if migration 20260822120000 is already deployed.
-- ═══════════════════════════════════════════════════════

CREATE OR REPLACE VIEW public.cn_false_positive_deleted_receipts
WITH (security_invoker = true) AS
SELECT
  ve.id                    AS voucher_id,
  ve.voucher_number,
  ve.organization_id,
  ve.reference_id          AS sale_id,
  s.sale_number,
  s.customer_id,
  c.customer_name,
  ve.total_amount          AS cn_amount,
  COALESCE(s.sale_return_adjust, 0) AS invoice_sra,
  COALESCE(s.paid_amount, 0)      AS invoice_paid,
  COALESCE(s.net_amount, 0)
    - COALESCE(s.paid_amount, 0)
    - COALESCE(s.sale_return_adjust, 0) AS invoice_outstanding,
  ve.deleted_at,
  ve.notes,
  ve.description,
  sr.id                    AS sale_return_id,
  sr.return_number,
  COALESCE(sr.net_amount, 0) AS return_net,
  COALESCE(sr.credit_available_balance, sr.net_amount, 0) AS return_cab
FROM public.voucher_entries ve
INNER JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN public.customers c
  ON c.id = s.customer_id
 AND c.organization_id = ve.organization_id
LEFT JOIN public.sale_returns sr
  ON sr.linked_sale_id = s.id
 AND sr.organization_id = ve.organization_id
 AND sr.deleted_at IS NULL
 AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
WHERE ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.deleted_at IS NOT NULL
  AND COALESCE(s.sale_return_adjust, 0) < 0.5
  AND (
    COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
    OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
    OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
    OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
  );

GRANT SELECT ON public.cn_false_positive_deleted_receipts TO authenticated;


-- ═══════════════════════════════════════════════════════
-- SECTION 1 — DRY RUN (read-only): rows that WILL be repaired
-- ═══════════════════════════════════════════════════════

WITH false_positive_fp AS (
  SELECT
    ve.id                    AS voucher_id,
    ve.voucher_number,
    ve.organization_id,
    ve.reference_id          AS sale_id,
    s.sale_number,
    c.customer_name,
    ve.total_amount          AS cn_amount,
    COALESCE(s.net_amount, 0)
      - COALESCE(s.paid_amount, 0)
      - COALESCE(s.sale_return_adjust, 0) AS invoice_outstanding,
    sr.id                    AS sale_return_id,
    sr.return_number,
    COALESCE(sr.net_amount, 0) AS return_net
  FROM public.voucher_entries ve
  INNER JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  LEFT JOIN public.customers c
    ON c.id = s.customer_id
   AND c.organization_id = ve.organization_id
  LEFT JOIN public.sale_returns sr
    ON sr.linked_sale_id = s.id
   AND sr.organization_id = ve.organization_id
   AND sr.deleted_at IS NULL
   AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
SELECT
  v.voucher_number,
  v.customer_name,
  v.sale_number,
  v.cn_amount,
  v.invoice_outstanding,
  v.return_number,
  v.return_net,
  ROUND(v.return_net - v.cn_amount, 2) AS remainder_after_apply,
  CASE
    WHEN ROUND(v.return_net - v.cn_amount, 2) > 0.5
      THEN 'REVIEW — remainder may need refund voucher'
    ELSE 'OK — full apply'
  END AS repair_flag
FROM false_positive_fp v
ORDER BY v.cn_amount DESC;


-- ═══════════════════════════════════════════════════════
-- SECTION 2 — BACKUP snapshot (run once before mutate)
-- ═══════════════════════════════════════════════════════

CREATE TABLE IF NOT EXISTS public.ella_noor_cn_false_positive_restore_20260822_snapshot (
  snapshot_kind text NOT NULL,
  row_id uuid NOT NULL,
  payload jsonb NOT NULL,
  captured_at timestamptz NOT NULL DEFAULT now()
);

WITH false_positive_fp AS (
  SELECT
    ve.id AS voucher_id,
    ve.reference_id AS sale_id,
    sr.id AS sale_return_id
  FROM public.voucher_entries ve
  INNER JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  LEFT JOIN public.sale_returns sr
    ON sr.linked_sale_id = s.id
   AND sr.organization_id = ve.organization_id
   AND sr.deleted_at IS NULL
   AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
INSERT INTO public.ella_noor_cn_false_positive_restore_20260822_snapshot(snapshot_kind, row_id, payload)
SELECT 'voucher_entry', ve.id, to_jsonb(ve)
FROM public.voucher_entries ve
WHERE ve.id IN (SELECT voucher_id FROM false_positive_fp);

WITH false_positive_fp AS (
  SELECT ve.reference_id AS sale_id
  FROM public.voucher_entries ve
  INNER JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
INSERT INTO public.ella_noor_cn_false_positive_restore_20260822_snapshot(snapshot_kind, row_id, payload)
SELECT 'sale', s.id,
  jsonb_build_object(
    'sale_number', s.sale_number,
    'net_amount', s.net_amount,
    'paid_amount', s.paid_amount,
    'sale_return_adjust', s.sale_return_adjust,
    'payment_status', s.payment_status,
    'customer_id', s.customer_id
  )
FROM public.sales s
WHERE s.id IN (SELECT sale_id FROM false_positive_fp);

WITH false_positive_fp AS (
  SELECT sr.id AS sale_return_id
  FROM public.voucher_entries ve
  INNER JOIN public.sales s
    ON s.id = ve.reference_id
   AND s.organization_id = ve.organization_id
   AND s.deleted_at IS NULL
  INNER JOIN public.sale_returns sr
    ON sr.linked_sale_id = s.id
   AND sr.organization_id = ve.organization_id
   AND sr.deleted_at IS NULL
   AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  WHERE ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.deleted_at IS NOT NULL
    AND COALESCE(s.sale_return_adjust, 0) < 0.5
    AND (
      COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
      OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
      OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
    )
    AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
)
INSERT INTO public.ella_noor_cn_false_positive_restore_20260822_snapshot(snapshot_kind, row_id, payload)
SELECT 'sale_return', sr.id, to_jsonb(sr)
FROM public.sale_returns sr
WHERE sr.id IN (SELECT sale_return_id FROM false_positive_fp);


-- ═══════════════════════════════════════════════════════
-- SECTION 3 — REPAIR (single transaction — review dry-run first)
-- ═══════════════════════════════════════════════════════

BEGIN;

CREATE TEMP TABLE _cn_fp_repair_targets ON COMMIT DROP AS
SELECT
  ve.id                    AS voucher_id,
  ve.organization_id,
  ve.reference_id          AS sale_id,
  ve.total_amount          AS cn_amount,
  LEAST(
    ve.total_amount,
    GREATEST(
      0::numeric,
      COALESCE(s.net_amount, 0) - COALESCE(s.paid_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    )
  ) AS sra_to_apply,
  sr.id                    AS sale_return_id,
  COALESCE(sr.net_amount, 0) AS return_net
FROM public.voucher_entries ve
INNER JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
 AND s.deleted_at IS NULL
LEFT JOIN public.sale_returns sr
  ON sr.linked_sale_id = s.id
 AND sr.organization_id = ve.organization_id
 AND sr.deleted_at IS NULL
 AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
WHERE ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.deleted_at IS NOT NULL
  AND COALESCE(s.sale_return_adjust, 0) < 0.5
  AND (
    COALESCE(ve.notes, '') ILIKE '%cn_over_apply_repair%'
    OR COALESCE(ve.notes, '') ILIKE '%phantom_cn_repair%'
    OR COALESCE(ve.notes, '') ILIKE '%phantom credit_note_adjustment%'
    OR COALESCE(ve.description, '') ILIKE '%credit note adjusted%'
  )
  AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid;

-- 3a. Set sale_return_adjust on each affected invoice (capped at invoice balance).
UPDATE public.sales s
SET
  sale_return_adjust = fp.sra_to_apply,
  credit_applied = fp.sra_to_apply,
  payment_status = CASE
    WHEN COALESCE(s.net_amount, 0) - COALESCE(s.paid_amount, 0) - fp.sra_to_apply <= 0.5
      THEN 'completed'
    WHEN fp.sra_to_apply > 0.5 THEN 'partial'
    ELSE s.payment_status
  END,
  updated_at = now()
FROM _cn_fp_repair_targets fp
WHERE fp.sale_id = s.id
  AND s.organization_id = fp.organization_id
  AND fp.sra_to_apply > 0.005;

-- 3b. Restore the deleted CN-adjust receipts (clear deleted_at).
UPDATE public.voucher_entries ve
SET
  deleted_at = NULL,
  deleted_by = NULL,
  notes = COALESCE(ve.notes, '') ||
    E'\n[cn_false_positive_restore_20260822] restored after cn_over_apply false-positive review',
  updated_at = now()
FROM _cn_fp_repair_targets fp
WHERE fp.voucher_id = ve.id
  AND ve.deleted_at IS NOT NULL;

-- 3c. Set credit_available_balance on linked sale returns (remainder after apply).
UPDATE public.sale_returns sr
SET
  credit_available_balance = GREATEST(0, ROUND(COALESCE(sr.net_amount, 0) - fp.cn_amount, 2)),
  credit_status = CASE
    WHEN COALESCE(sr.net_amount, 0) - fp.cn_amount <= 0.5 THEN 'adjusted'
    ELSE 'partially_adjusted'
  END,
  updated_at = now()
FROM _cn_fp_repair_targets fp
WHERE fp.sale_return_id = sr.id
  AND sr.deleted_at IS NULL;

-- 3d. Resync paid_amount via canonical settlement (non-regressive).
WITH recomputed AS (
  SELECT
    s.id,
    s.paid_amount AS old_paid,
    s.payment_status AS old_status,
    c.new_paid,
    c.new_status
  FROM public.sales s
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) AS c
  WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND s.id IN (SELECT sale_id FROM _cn_fp_repair_targets)
    AND s.deleted_at IS NULL
    AND c.new_paid IS NOT NULL
)
UPDATE public.sales s
SET paid_amount = r.new_paid,
    payment_status = r.new_status
FROM recomputed r
WHERE r.id = s.id
  AND (
    ABS(COALESCE(r.old_paid, 0) - r.new_paid) > 0.009
    OR COALESCE(r.old_status, '') <> r.new_status
  )
  AND NOT (COALESCE(r.old_status, '') = 'completed' AND r.new_status <> 'completed')
  AND NOT (r.new_paid < COALESCE(r.old_paid, 0) - 0.009 AND r.new_status <> 'completed');

-- Verify inside transaction before COMMIT:
-- SELECT count(*) FROM _cn_fp_repair_targets;

COMMIT;
-- ROLLBACK;  -- use if verification fails


-- ═══════════════════════════════════════════════════════
-- SECTION 4 — POST-REPAIR verification
-- ═══════════════════════════════════════════════════════

SELECT customer_name, signed_balance, direction, net_receivable
FROM public.get_customer_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE customer_name ILIKE ANY (ARRAY[
  '%AMNA DARVESH%', '%Sharmin Mewara%', '%GULNAZ%', '%MAHENOOR KAS%',
  '%Amrin%', '%Muskan%', '%OSAMA%', '%QURRATUL AIN%', '%Shanawaz Memon%',
  '%Mahi Supariwala%', '%Ruby Bhatia%', '%KHADIJA SHEIKH%', '%SAMEENA MADHIYA%',
  '%FIZA CHAUDHARY%', '%Naeem Mukadam%', '%priyanka Yadav%', '%Nazbin Choudhury%',
  '%Sadiqa Faisal Khan%', '%Sadiya Surat%', '%Arezah Nathani%', '%AYESHA MERCHANT%',
  '%SABINA SAMEER%'
])
ORDER BY customer_name, signed_balance;
