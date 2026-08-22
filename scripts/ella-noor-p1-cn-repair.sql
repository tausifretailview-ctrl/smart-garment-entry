-- =============================================================================
-- ELLA NOOR — P1 CN double-apply / return-pool repair
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- =============================================================================
-- Targets (repair-cn-double-apply-checklist.md P1):
--   FAIZA SALMAN MERCHANT — linked SR/35 CAB drift (₹6,000 applied, pool stale)
--   Parina Bhujwala       — SR/64 pending vs INV/1245 SRA/voucher ₹6,350
--
-- Broader P1 queue (§1C): Saba Ali, Siya Kapoor — use §0 export + ella-noor-p1-cn-breakdown.sql
--
-- Rules: run §1 dry-run first → owner sign-off → uncomment ONE repair block → §5 verify
-- Tag every mutation: [p1_cn_repair_YYYYMMDD]
-- =============================================================================


-- -----------------------------------------------------------------------------
-- §0 P1 queue snapshot (A2 — CN vouchers + open return pool)
-- -----------------------------------------------------------------------------
WITH cn_on_sales AS (
  SELECT s.customer_id,
         SUM(ve.total_amount) AS cn_voucher_applied
  FROM public.voucher_entries ve
  JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
  WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND ve.deleted_at IS NULL
    AND ve.voucher_type = 'receipt'
    AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
    AND ve.reference_type IN ('sale', 'SALE', 'CustomerReceipt')
    AND s.deleted_at IS NULL
  GROUP BY s.customer_id
),
pending_sr AS (
  SELECT customer_id,
         SUM(COALESCE(credit_available_balance, net_amount, 0)) AS pending_cab
  FROM public.sale_returns
  WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    AND deleted_at IS NULL
    AND LOWER(COALESCE(credit_status, '')) IN ('pending', 'partially_adjusted')
    AND COALESCE(refund_type, '') <> 'cash_refund'
  GROUP BY customer_id
)
SELECT
  c.customer_name,
  ROUND(COALESCE(cn.cn_voucher_applied, 0), 2) AS cn_vouchers,
  ROUND(COALESCE(ps.pending_cab, 0), 2) AS pending_return_pool,
  ROUND(COALESCE(cn.cn_voucher_applied, 0) + COALESCE(ps.pending_cab, 0), 2) AS double_count_ceiling,
  pb.out_signed_balance AS party_balance,
  pb.out_direction AS party_dir
FROM public.customers c
LEFT JOIN cn_on_sales cn ON cn.customer_id = c.id
LEFT JOIN pending_sr ps ON ps.customer_id = c.id
LEFT JOIN public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) pb
  ON pb.out_customer_id = c.id
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND COALESCE(cn.cn_voucher_applied, 0) > 500
  AND COALESCE(ps.pending_cab, 0) > 500
ORDER BY double_count_ceiling DESC;


-- -----------------------------------------------------------------------------
-- §1 Per-customer diagnostic — P1 checklist names
-- -----------------------------------------------------------------------------
SELECT
  c.customer_name,
  sr.return_number,
  sr.id AS sale_return_id,
  sr.net_amount,
  sr.credit_available_balance,
  sr.credit_status,
  sr.linked_sale_id,
  ls.sale_number AS linked_invoice,
  COALESCE(ls.sale_return_adjust, 0) AS linked_sra,
  cn.credit_note_number,
  cn.credit_amount,
  cn.used_amount,
  public._sale_return_remaining_credit_for_balance(
    sr.net_amount,
    sr.credit_available_balance,
    COALESCE(ls.sale_return_adjust, 0)
  ) AS balance_rpc_credit
FROM public.sale_returns sr
JOIN public.customers c ON c.id = sr.customer_id
LEFT JOIN public.sales ls
  ON ls.id = sr.linked_sale_id
 AND ls.organization_id = sr.organization_id
 AND ls.deleted_at IS NULL
LEFT JOIN public.credit_notes cn
  ON cn.id = sr.credit_note_id
 AND cn.organization_id = sr.organization_id
 AND cn.deleted_at IS NULL
WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND UPPER(TRIM(c.customer_name)) IN (
    'FAIZA SALMAN MERCHANT',
    'PARINA BHUJWALA',
    'SABA ALI',
    'SIYA KAPOOR'
  )
ORDER BY c.customer_name, sr.return_number;


-- §1b Invoices + CN vouchers for same customers
SELECT
  c.customer_name,
  s.sale_number,
  s.net_amount,
  s.paid_amount,
  s.sale_return_adjust,
  s.payment_status,
  ve.voucher_number,
  ve.reference_type,
  ve.total_amount AS cn_voucher_amt,
  ve.deleted_at IS NOT NULL AS voucher_deleted
FROM public.sales s
JOIN public.customers c ON c.id = s.customer_id
LEFT JOIN public.voucher_entries ve
  ON ve.reference_id = s.id
 AND ve.organization_id = s.organization_id
 AND ve.voucher_type = 'receipt'
 AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
 AND ve.deleted_at IS NULL
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.deleted_at IS NULL
  AND UPPER(TRIM(c.customer_name)) IN (
    'FAIZA SALMAN MERCHANT',
    'PARINA BHUJWALA',
    'SABA ALI',
    'SIYA KAPOOR'
  )
  AND (COALESCE(s.sale_return_adjust, 0) > 0.01 OR ve.id IS NOT NULL)
ORDER BY c.customer_name, s.sale_number, ve.voucher_number;


-- -----------------------------------------------------------------------------
-- §2 Dry-run — return pool fix impact (before / after rpc_credit)
-- -----------------------------------------------------------------------------
SELECT
  c.customer_name,
  sr.return_number,
  sr.credit_available_balance AS cab_before,
  sr.credit_status AS status_before,
  CASE c.customer_name
    WHEN 'FAIZA SALMAN MERCHANT' THEN 200::numeric   -- ₹6,200 net − ₹6,000 applied
    WHEN 'Parina Bhujwala' THEN 0::numeric            -- consume SR/64 against INV/1245
    ELSE NULL
  END AS cab_after_proposed,
  CASE c.customer_name
    WHEN 'FAIZA SALMAN MERCHANT' THEN 'partially_adjusted'
    WHEN 'Parina Bhujwala' THEN 'adjusted'
    ELSE sr.credit_status
  END AS status_after_proposed,
  public._sale_return_remaining_credit_for_balance(
    sr.net_amount, sr.credit_available_balance,
    COALESCE(ls.sale_return_adjust, 0)
  ) AS rpc_credit_before
FROM public.sale_returns sr
JOIN public.customers c ON c.id = sr.customer_id
LEFT JOIN public.sales ls
  ON ls.id = sr.linked_sale_id AND ls.organization_id = sr.organization_id
WHERE sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND (
    (c.customer_name = 'FAIZA SALMAN MERCHANT' AND sr.return_number = 'SR/26-27/35')
    OR (c.customer_name = 'Parina Bhujwala' AND sr.return_number = 'SR/26-27/64')
  )
ORDER BY c.customer_name;


-- =============================================================================
-- §3 REPAIR — uncomment ONE block after §1–§2 review + owner sign-off
-- =============================================================================

-- -----------------------------------------------------------------------------
-- §3a FAIZA SALMAN MERCHANT — SR/35 CAB sync (₹6,000 applied on INV/729, net ₹6,200)
-- Expected: party unchanged; A2 row drops or ceiling → ~₹200 tail only
-- -----------------------------------------------------------------------------
/*
BEGIN;

UPDATE public.sale_returns sr
SET
  credit_available_balance = 200,
  credit_status = 'partially_adjusted',
  linked_sale_id = COALESCE(
    sr.linked_sale_id,
    (SELECT s.id FROM public.sales s
     WHERE s.organization_id = sr.organization_id
       AND s.sale_number = 'INV/26-27/729'
       AND s.deleted_at IS NULL
     LIMIT 1)
  ),
  notes = COALESCE(sr.notes, '') ||
    E'\n[p1_cn_repair_20260822] SR/35 CAB synced: ₹6,000 applied, ₹200 remainder on net ₹6,200',
  updated_at = now()
FROM public.customers c
WHERE sr.customer_id = c.id
  AND c.customer_name = 'FAIZA SALMAN MERCHANT'
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND sr.return_number = 'SR/26-27/35';

UPDATE public.credit_notes cn
SET
  used_amount = LEAST(COALESCE(cn.credit_amount, 0), 6000),
  status = CASE
    WHEN COALESCE(cn.credit_amount, 0) - 6000 <= 0.01 THEN 'fully_used'
    ELSE 'partially_used'
  END,
  notes = COALESCE(cn.notes, '') ||
    E'\n[p1_cn_repair_20260822] used_amount synced to match CN apply on INV/729',
  updated_at = now()
FROM public.sale_returns sr
JOIN public.customers c ON c.id = sr.customer_id
WHERE cn.id = sr.credit_note_id
  AND cn.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.customer_name = 'FAIZA SALMAN MERCHANT'
  AND sr.return_number = 'SR/26-27/35';

COMMIT;
*/

-- Alternative §3a-full: owner confirms return fully consumed → CAB = 0, adjusted
/*
BEGIN;
UPDATE public.sale_returns sr
SET credit_available_balance = 0, credit_status = 'adjusted',
    notes = COALESCE(sr.notes, '') || E'\n[p1_cn_repair_20260822] SR/35 fully adjusted',
    updated_at = now()
FROM public.customers c
WHERE sr.customer_id = c.id AND c.customer_name = 'FAIZA SALMAN MERCHANT'
  AND sr.return_number = 'SR/26-27/35'
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid;
COMMIT;
*/


-- -----------------------------------------------------------------------------
-- §3b Parina Bhujwala — Option A: return net ₹3,350 (link SR/64, zero pool)
-- Does NOT change INV/1245 SRA/voucher — use only if shop confirms ₹6,350 over-apply
-- is a separate issue. Removes double-count from open return pool.
-- -----------------------------------------------------------------------------
/*
BEGIN;

UPDATE public.sale_returns sr
SET
  credit_available_balance = 0,
  credit_status = 'adjusted',
  linked_sale_id = (
    SELECT s.id FROM public.sales s
    WHERE s.organization_id = sr.organization_id
      AND s.sale_number = 'INV/26-27/1245'
      AND s.deleted_at IS NULL
    LIMIT 1
  ),
  notes = COALESCE(sr.notes, '') ||
    E'\n[p1_cn_repair_20260822] SR/64 consumed against INV/1245; return pool zeroed',
  updated_at = now()
FROM public.customers c
WHERE sr.customer_id = c.id
  AND c.customer_name = 'Parina Bhujwala'
  AND sr.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND sr.deleted_at IS NULL
  AND sr.return_number = 'SR/26-27/64';

COMMIT;
*/

-- §3c Parina Option B — if owner confirms return was ₹6,350 not ₹3,350:
-- Do NOT run §3b. Instead escalate: SRA + voucher already ₹6,350; only fix reference_type
-- (§4) and set SR/64 net/CN header to match. SRA/voucher reduction requires new
-- adjust_invoice_balance reversal — do not hand-edit voucher total_amount (trg_cn_adjust_sync).


-- -----------------------------------------------------------------------------
-- §4 reference_type hygiene PREVIEW (CustomerReceipt → sale where ref = sales.id)
-- -----------------------------------------------------------------------------
SELECT
  c.customer_name,
  ve.voucher_number,
  ve.reference_type,
  s.sale_number,
  ve.total_amount
FROM public.voucher_entries ve
JOIN public.sales s ON s.id = ve.reference_id AND s.organization_id = ve.organization_id
JOIN public.customers c ON c.id = s.customer_id
WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.reference_type = 'CustomerReceipt'
  AND UPPER(TRIM(c.customer_name)) IN (
    'FAIZA SALMAN MERCHANT',
    'PARINA BHUJWALA',
    'SABA ALI',
    'SIYA KAPOOR',
    'FAIZA SHEIKH',
    'ATIYA MERCHANT'
  )
ORDER BY c.customer_name, ve.voucher_number;

-- Apply only after backup (uncomment):
/*
UPDATE public.voucher_entries ve
SET reference_type = 'sale',
    notes = COALESCE(ve.notes, '') || E'\n[p1_cn_repair_20260822] reference_type CustomerReceipt→sale',
    updated_at = now()
FROM public.sales s
WHERE ve.reference_id = s.id
  AND ve.organization_id = s.organization_id
  AND ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
  AND ve.reference_type = 'CustomerReceipt';
*/


-- -----------------------------------------------------------------------------
-- §5 Verify party balance after repair
-- -----------------------------------------------------------------------------
SELECT out_customer_name, out_direction, out_signed_balance
FROM public._get_customer_party_balances_rows('3fdca631-1e0c-4417-9704-421f5129ff67'::uuid)
WHERE out_customer_name IN (
  'FAIZA SALMAN MERCHANT',
  'Parina Bhujwala',
  'Saba Ali',
  'Siya Kapoor'
)
ORDER BY out_signed_balance DESC;

-- Re-run audit A2 (expect P1 rows to drop or ceiling shrink):
-- scripts/audit-cn-double-apply.sql Block A2 (uncomment org filter)
