-- One-shot data fix: recompute sales.payment_status for drifted rows in
-- KS FOOTWEAR and ELLA NOOR ONLY, using the canonical settlement rule.
--
-- STATUS COLUMN ONLY. This migration never writes paid_amount or
-- sale_return_adjust (or any other column). Every changed row is recorded in
-- audit_logs (old -> new), so the change is fully auditable and reversible.
--
-- Canonical rule — mirrors src/utils/saleSettlement.ts derivePaidAndStatus and
-- its ₹0.50 settlement tolerance:
--     outstanding := net_amount - paid_amount - COALESCE(sale_return_adjust,0)
--     new_status  := CASE
--                      WHEN outstanding <= 0.5                              THEN 'completed'
--                      WHEN (paid_amount + COALESCE(sale_return_adjust,0)) > 0 THEN 'partial'
--                      ELSE 'pending'
--                    END
--
-- pay_later guard (do NOT fight enforce_pay_later_zero_paid):
--   A pay_later sale with paid_amount = 0 AND no sale_return_adjust credit must
--   stay 'pending' and is excluded from the recompute entirely. Only sales with
--   a real paid_amount OR a real S/R credit are eligible to move to
--   'partial' / 'completed'.
--
-- Scope (hard filters, all must apply):
--   organization_id IN (KS FOOTWEAR, ELLA NOOR)  -- no other org is touched
--   deleted_at IS NULL
--   payment_status NOT IN ('cancelled','hold')
--   NOT (pay_later AND paid_amount = 0 AND sale_return_adjust = 0)
--
-- Expected: ~28 rows updated. After running, the drift query
-- (outstanding vs payment_status) for both orgs returns zero rows.

BEGIN;

WITH scope AS (
  SELECT
    s.id,
    s.organization_id,
    s.payment_status AS old_status,
    CASE
      WHEN (s.net_amount - COALESCE(s.paid_amount, 0) - COALESCE(s.sale_return_adjust, 0)) <= 0.5
        THEN 'completed'
      WHEN (COALESCE(s.paid_amount, 0) + COALESCE(s.sale_return_adjust, 0)) > 0
        THEN 'partial'
      ELSE 'pending'
    END AS new_status
  FROM public.sales s
  WHERE s.organization_id IN (
      '4bc73037-e877-4123-9261-eb6e3876698c',  -- KS FOOTWEAR
      '3fdca631-1e0c-4417-9704-421f5129ff67'   -- ELLA NOOR
    )
    AND s.deleted_at IS NULL
    AND s.payment_status NOT IN ('cancelled', 'hold')
    -- pay_later guard: credit sale with no money and no S/R credit stays 'pending'
    AND NOT (
      s.payment_method = 'pay_later'
      AND COALESCE(s.paid_amount, 0) = 0
      AND COALESCE(s.sale_return_adjust, 0) = 0
    )
),
drifted AS (
  SELECT id, organization_id, old_status, new_status
  FROM scope
  WHERE new_status <> old_status
),
updated AS (
  UPDATE public.sales s
  SET payment_status = d.new_status
  FROM drifted d
  WHERE s.id = d.id
  RETURNING s.id, s.organization_id, d.old_status, d.new_status
)
INSERT INTO public.audit_logs (
  organization_id,
  action,
  entity_type,
  entity_id,
  old_values,
  new_values,
  metadata
)
SELECT
  u.organization_id,
  'PAYMENT_STATUS_RECONCILED',
  'sale',
  u.id::text,
  jsonb_build_object('payment_status', u.old_status),
  jsonb_build_object('payment_status', u.new_status),
  jsonb_build_object(
    'reason', 'payment_status reconciliation (KS/ELLA)',
    'tolerance', 0.5,
    'rule', 'derivePaidAndStatus'
  )
FROM updated u;

COMMIT;
