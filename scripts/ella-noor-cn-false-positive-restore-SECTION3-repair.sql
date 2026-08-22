-- SECTION 3 ONLY — repair 28 false-positive deleted CN receipts (single transaction)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Run SECTION 2 backup first. Review output of pre-check below, then COMMIT or ROLLBACK.

BEGIN;

CREATE TEMP TABLE _cn_fp_repair_targets ON COMMIT DROP AS
SELECT
  ve.id                    AS voucher_id,
  ve.voucher_number,
  ve.organization_id,
  ve.reference_id          AS sale_id,
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  ve.total_amount          AS cn_amount,
  LEAST(
    ve.total_amount,
    GREATEST(
      0::numeric,
      COALESCE(s.net_amount, 0) - COALESCE(s.paid_amount, 0) - COALESCE(s.sale_return_adjust, 0)
    )
  ) AS sra_to_apply,
  sr.id                    AS sale_return_id,
  sr.return_number,
  COALESCE(sr.net_amount, 0) AS return_net,
  active_dup.id            AS active_duplicate_voucher_id
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
LEFT JOIN public.voucher_entries active_dup
  ON active_dup.voucher_number = ve.voucher_number
 AND active_dup.deleted_at IS NULL
 AND active_dup.id <> ve.id
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

-- Pre-check inside transaction (expect 28 rows)
SELECT
  voucher_number,
  sale_number,
  cn_amount,
  sra_to_apply,
  return_number,
  return_net,
  ROUND(return_net - cn_amount, 2) AS remainder_after_apply,
  CASE WHEN cn_amount > sra_to_apply + 0.5 THEN 'CN exceeds invoice cap' ELSE 'OK' END AS cap_flag,
  CASE
    WHEN active_duplicate_voucher_id IS NULL THEN 'RESTORE'
    ELSE 'SKIP_RESTORE — active ' || voucher_number || ' exists (id=' || active_duplicate_voucher_id || ')'
  END AS restore_action
FROM _cn_fp_repair_targets
ORDER BY cn_amount DESC;

-- 3a. Set sale_return_adjust (capped at current invoice balance)
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

-- 3b. Restore deleted CN-adjust receipts (skip when active twin exists — uq_voucher_entries_number_active)
UPDATE public.voucher_entries ve
SET
  deleted_at = NULL,
  deleted_by = NULL,
  notes = COALESCE(ve.notes, '') ||
    E'\n[cn_false_positive_restore_20260822] restored after cn_over_apply false-positive review',
  updated_at = now()
FROM _cn_fp_repair_targets fp
WHERE fp.voucher_id = ve.id
  AND ve.deleted_at IS NOT NULL
  AND fp.active_duplicate_voucher_id IS NULL;

-- 3b-skip. Audit note on deleted twins that cannot be undeleted (invoice SRA still repaired in 3a)
UPDATE public.voucher_entries ve
SET
  notes = COALESCE(ve.notes, '') ||
    E'\n[cn_false_positive_restore_20260822] restore skipped — active voucher ' ||
    fp.voucher_number || ' already exists (id=' || fp.active_duplicate_voucher_id ||
    '); sale_return_adjust applied on ' || fp.sale_number,
  updated_at = now()
FROM _cn_fp_repair_targets fp
WHERE fp.voucher_id = ve.id
  AND ve.deleted_at IS NOT NULL
  AND fp.active_duplicate_voucher_id IS NOT NULL
  AND COALESCE(ve.notes, '') NOT ILIKE '%restore skipped — active voucher%';

-- 3c. Update linked sale return pool (skip when no linked return)
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

-- 3d. Resync paid_amount / payment_status (non-regressive)
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

-- Post-repair invoice state (review before COMMIT)
SELECT
  fp.voucher_number,
  fp.sale_number,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.payment_status,
  s.net_amount - s.paid_amount - s.sale_return_adjust AS invoice_remaining
FROM _cn_fp_repair_targets fp
JOIN public.sales s ON s.id = fp.sale_id
ORDER BY fp.cn_amount DESC;

COMMIT;
-- ROLLBACK;
