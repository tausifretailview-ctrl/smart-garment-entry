-- =============================================================================
-- ELLA NOOR — R3 return pool fix (Sharmin Mewara + Tanvi Taufu)
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Validated Aug 2026:
--   Sharmin SR/25-26/39: party −₹11,500 Cr → ₹0 Settled
--   Tanvi SR/25-26/47 + SR/25-26/49: party stays ₹2,950 Dr (CAB hygiene only)
--
-- Rules: dry-run §1 first, review rpc_credit_before, then §2 COMMIT, then §3 verify
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §1 Dry-run
-- -----------------------------------------------------------------------------
SELECT
  c.customer_name,
  sr.return_number,
  sr.net_amount,
  sr.credit_available_balance AS cab_before,
  sr.credit_status,
  ls.sale_number AS linked_invoice,
  COALESCE(ls.sale_return_adjust, 0) AS linked_sra,
  public._sale_return_remaining_credit_for_balance(
    sr.net_amount,
    sr.credit_available_balance,
    COALESCE(ls.sale_return_adjust, 0)
  ) AS rpc_credit_before,
  0::numeric AS cab_after,
  0::numeric AS rpc_credit_after
FROM public.sale_returns sr
JOIN public.customers c ON c.id = sr.customer_id
LEFT JOIN public.sales ls
  ON ls.id = sr.linked_sale_id
 AND ls.organization_id = sr.organization_id
 AND ls.deleted_at IS NULL
WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND (
    (c.customer_name = 'Sharmin Mewara' AND sr.return_number = 'SR/25-26/39')
    OR (c.customer_name = 'Tanvi Taufu' AND sr.return_number IN ('SR/25-26/47', 'SR/25-26/49'))
  )
ORDER BY c.customer_name, sr.return_number;


-- -----------------------------------------------------------------------------
-- §2 Repair (3 rows). Review §1 first.
-- -----------------------------------------------------------------------------
/*
BEGIN;

UPDATE public.sale_returns sr
SET
  credit_available_balance = 0,
  credit_status = 'adjusted',
  notes = COALESCE(sr.notes, '') ||
    E'\n[r3_return_pool_fix_20260822] stale CAB zeroed; return fully consumed via invoice SRA',
  updated_at = now()
FROM public.customers c
WHERE sr.customer_id = c.id
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND (
    (c.customer_name = 'Sharmin Mewara' AND sr.return_number = 'SR/25-26/39')
    OR (c.customer_name = 'Tanvi Taufu' AND sr.return_number IN ('SR/25-26/47', 'SR/25-26/49'))
  );

COMMIT;
*/


-- -----------------------------------------------------------------------------
-- §3 Verify party balance
-- -----------------------------------------------------------------------------
SELECT out_customer_name, out_signed_balance, out_direction
FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE out_customer_name IN ('Sharmin Mewara', 'Tanvi Taufu');
