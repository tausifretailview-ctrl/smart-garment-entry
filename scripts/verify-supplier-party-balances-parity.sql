-- Parity gate: get_supplier_party_balances vs app computeSnapshotForSupplier / Supplier Ledger.
-- Apply migration 20260910120000_get_supplier_party_balances.sql first, then run in SQL editor.
--
-- Org: ELLA NOOR 3fdca631-1e0c-4417-9704-421f5129ff67
--
-- Canonical TS reference: src/utils/supplierBalanceUtils.ts fetchSupplierBalanceSnapshotsForOrg
-- Node cross-check: npx tsx scripts/verify-supplier-party-balances-parity.ts

-- =============================================================================
-- 0) Sign-off suppliers — drift must be 0
--     SRK TELELINK (SCN-00001 CN case), plus search by name for payable/advance samples
-- =============================================================================
WITH party AS (
  SELECT supplier_id, supplier_name, signed_balance, direction
  FROM public.get_supplier_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
  WHERE supplier_name ILIKE '%SRK%TELELINK%'
     OR supplier_name ILIKE '%TELELINK%'
)
SELECT
  p.supplier_name,
  p.signed_balance AS rpc_balance,
  p.direction
FROM party p
ORDER BY p.supplier_name;

-- =============================================================================
-- 1) Component breakdown for SRK TELELINK (manual compare to Supplier Ledger cards)
-- =============================================================================
WITH org_id AS (SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id),
target AS (
  SELECT s.id, s.supplier_name, COALESCE(s.opening_balance, 0)::numeric AS opening_balance
  FROM public.suppliers s, org_id o
  WHERE s.organization_id = o.id
    AND s.deleted_at IS NULL
    AND s.supplier_name ILIKE '%SRK%TELELINK%'
  LIMIT 1
),
org_bills AS (
  SELECT pb.*
  FROM public.purchase_bills pb, org_id o, target t
  WHERE pb.organization_id = o.id
    AND pb.supplier_id = t.id
    AND pb.deleted_at IS NULL
    AND (pb.is_cancelled IS NULL OR pb.is_cancelled = false)
),
cn_gross AS (
  SELECT COALESCE(SUM(GREATEST(0, COALESCE(ve.total_amount, 0))), 0)::numeric AS amt
  FROM public.voucher_entries ve, org_id o, target t
  WHERE ve.organization_id = o.id
    AND ve.deleted_at IS NULL
    AND lower(ve.voucher_type) = 'credit_note'
    AND trim(ve.reference_id::text) = trim(t.id::text)
),
cn_applied AS (
  SELECT COALESCE(SUM(
    CASE
      WHEN pr.credit_available_balance IS NULL THEN GREATEST(0, COALESCE(ve.total_amount, 0))
      ELSE GREATEST(0, COALESCE(ve.total_amount, 0) - COALESCE(pr.credit_available_balance, 0))
    END
  ), 0)::numeric AS amt
  FROM public.purchase_returns pr
  INNER JOIN public.voucher_entries ve ON ve.id = pr.credit_note_id
  CROSS JOIN org_id o
  CROSS JOIN target t
  WHERE pr.organization_id = o.id
    AND pr.supplier_id = t.id
    AND pr.deleted_at IS NULL
    AND lower(trim(COALESCE(pr.credit_status, ''))) = 'adjusted'
    AND pr.linked_bill_id IS NOT NULL
)
SELECT
  t.supplier_name,
  t.opening_balance,
  (SELECT COALESCE(SUM(net_amount), 0) FROM org_bills) AS total_purchases,
  (SELECT amt FROM cn_gross) AS cn_gross,
  (SELECT amt FROM cn_applied) AS cn_applied_to_bills,
  GREATEST(0, (SELECT amt FROM cn_gross) - (SELECT amt FROM cn_applied)) AS cn_net,
  (
    SELECT signed_balance
    FROM public.get_supplier_party_balances((SELECT id FROM org_id))
    WHERE supplier_id = t.id
  ) AS rpc_signed_balance
FROM target t;

-- =============================================================================
-- 2) Top 20 largest |balance| suppliers from RPC (spot-check in Supplier Ledger UI)
-- =============================================================================
SELECT
  supplier_name,
  signed_balance,
  direction
FROM public.get_supplier_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
ORDER BY ABS(signed_balance) DESC
LIMIT 20;

-- =============================================================================
-- 3) Grand totals sanity (total_cr = sum of positive balances = total payable)
-- =============================================================================
SELECT
  total_cr AS total_payable_cr,
  total_dr AS total_advance_dr,
  net_payable,
  COUNT(*) AS supplier_count
FROM public.get_supplier_party_balances('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
LIMIT 1;
