-- =============================================================================
-- ELLA NOOR phantom CN invoice repair — PHASE 0 pre-flight (READ-ONLY)
-- =============================================================================
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Run each query separately in Supabase SQL editor (service role).
-- Paste all 3 result sets before applying the repair script.
-- =============================================================================


-- ═══════════════════════════════════════════════════════
-- PREFLIGHT QUERY 1 — Customer state (live data)
-- Expected: 23 rows with repair_flag per customer
-- ═══════════════════════════════════════════════════════

WITH org AS (
  SELECT '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS id
),
affected_customers AS (
  SELECT c.id, c.customer_name
  FROM public.customers c, org
  WHERE c.organization_id = org.id
    AND c.deleted_at IS NULL
    AND c.customer_name ILIKE ANY (ARRAY[
      '%AMNA DARVESH%', '%Muskan%',
      '%Sharmin Mewara%', '%GULNAZ%',
      '%MAHENOOR KAS%', '%Amrin%',
      '%OSAMA%', '%QURRATUL AIN%',
      '%Shanawaz Memon%', '%Mahi Supariwala%',
      '%Ruby Bhatia%', '%KHADIJA SHEIKH%',
      '%FIZA CHAUDHARY%', '%SAMEENA MADHIYA%',
      '%PRIYANKA YADAV%', '%Naeem Mukadam%',
      '%Nazbin Choudhury%', '%Hanif bhai%',
      '%Sadiqa Faisal Khan%', '%Arezah Nathani%',
      '%Sadiya Surat%', '%AYESHA MERCHANT%',
      '%SABINA SAMEER%'
    ])
),
customer_outstanding AS (
  SELECT
    ac.id AS customer_id,
    ac.customer_name,
    public.get_customer_true_outstanding(
      ac.id,
      '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
    ) AS outstanding
  FROM affected_customers ac
),
invoice_summary AS (
  SELECT
    s.customer_id,
    COUNT(*) AS unpaid_count,
    COALESCE(SUM(
      s.net_amount
      - COALESCE(s.paid_amount, 0)
      - COALESCE(s.sale_return_adjust, 0)
    ), 0) AS total_pending
  FROM public.sales s, org
  WHERE s.organization_id = org.id
    AND s.customer_id IN (SELECT id FROM affected_customers)
    AND s.payment_status IN ('pending', 'partial')
    AND COALESCE(s.is_cancelled, false) = false
    AND s.deleted_at IS NULL
  GROUP BY s.customer_id
)
SELECT
  co.customer_name,
  co.outstanding,
  COALESCE(inv.unpaid_count, 0) AS unpaid_invoices,
  COALESCE(inv.total_pending, 0) AS total_pending,
  CASE
    WHEN co.outstanding > 0
      THEN 'SKIP — Dr balance (customer owes)'
    WHEN COALESCE(inv.unpaid_count, 0) = 0
      THEN 'SKIP — no pending invoices'
    WHEN ABS(co.outstanding) < COALESCE(inv.total_pending, 0) - 0.5
      THEN 'PARTIAL — credit less than pending'
    ELSE 'OK — full settlement expected'
  END AS repair_flag
FROM customer_outstanding co
LEFT JOIN invoice_summary inv ON inv.customer_id = co.customer_id
ORDER BY co.outstanding ASC;


-- ═══════════════════════════════════════════════════════
-- PREFLIGHT QUERY 2 — Idempotency check
-- Expected: already_repaired = 0
-- ═══════════════════════════════════════════════════════

SELECT COUNT(*) AS already_repaired
FROM public.voucher_entries ve
JOIN public.sales s ON s.id = ve.reference_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ve.payment_method = 'balance_adjustment'
  AND (
    COALESCE(ve.description, '') LIKE '%phantom_cn_repair_2026%'
    OR COALESCE(ve.notes, '') LIKE '%phantom_cn_repair_2026%'
  )
  AND ve.deleted_at IS NULL;


-- ═══════════════════════════════════════════════════════
-- PREFLIGHT QUERY 3 — Exact customer names in DB
-- Expected: 23 rows
-- ═══════════════════════════════════════════════════════

SELECT id, customer_name, phone
FROM public.customers
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND deleted_at IS NULL
  AND customer_name ILIKE ANY (ARRAY[
    '%AMNA DARVESH%', '%Muskan%',
    '%Sharmin Mewara%', '%GULNAZ%',
    '%MAHENOOR KAS%', '%Amrin%',
    '%OSAMA%', '%QURRATUL AIN%',
    '%Shanawaz Memon%', '%Mahi Supariwala%',
    '%Ruby Bhatia%', '%KHADIJA SHEIKH%',
    '%FIZA CHAUDHARY%', '%SAMEENA MADHIYA%',
    '%PRIYANKA YADAV%', '%Naeem Mukadam%',
    '%Nazbin Choudhury%', '%Hanif bhai%',
    '%Sadiqa Faisal Khan%', '%Arezah Nathani%',
    '%Sadiya Surat%', '%AYESHA MERCHANT%',
    '%SABINA SAMEER%'
  ])
ORDER BY customer_name;
