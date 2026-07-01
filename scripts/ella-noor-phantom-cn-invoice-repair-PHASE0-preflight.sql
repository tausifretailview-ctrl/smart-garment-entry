-- =============================================================================
-- ELLA NOOR phantom CN invoice repair — PHASE 0 pre-flight (READ-ONLY)
-- =============================================================================
-- Org: 3fdca631-1e0c-4417-9704-421f5129ff67
-- Run all sections in Supabase SQL editor BEFORE applying the repair script.
-- Sign convention: get_customer_true_outstanding > 0 = Dr (owes), < 0 = Cr (credit).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- QUERY 1 — Current state of 23 affected customers
-- -----------------------------------------------------------------------------
SELECT
  c.id AS customer_id,
  c.customer_name,
  c.phone,
  public.get_customer_true_outstanding(
    c.id,
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  ) AS current_outstanding,
  (
    SELECT COUNT(*)
    FROM public.sales s
    WHERE s.customer_id = c.id
      AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND s.payment_status IN ('pending', 'partial')
      AND COALESCE(s.is_cancelled, false) = false
      AND s.deleted_at IS NULL
  ) AS unpaid_invoice_count,
  (
    SELECT COALESCE(SUM(
      s.net_amount
      - COALESCE(s.paid_amount, 0)
      - COALESCE(s.sale_return_adjust, 0)
    ), 0)
    FROM public.sales s
    WHERE s.customer_id = c.id
      AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND s.payment_status IN ('pending', 'partial')
      AND COALESCE(s.is_cancelled, false) = false
      AND s.deleted_at IS NULL
  ) AS total_pending_on_invoices,
  CASE
    WHEN public.get_customer_true_outstanding(c.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid) > 0.5
      THEN 'SKIP — Dr balance (owes money)'
    WHEN (
      SELECT COALESCE(SUM(
        s.net_amount - COALESCE(s.paid_amount, 0) - COALESCE(s.sale_return_adjust, 0)
      ), 0)
      FROM public.sales s
      WHERE s.customer_id = c.id
        AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
        AND s.payment_status IN ('pending', 'partial')
        AND COALESCE(s.is_cancelled, false) = false
        AND s.deleted_at IS NULL
    ) <= 0.5
      THEN 'SKIP — nothing to settle'
    WHEN ABS(public.get_customer_true_outstanding(c.id, '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid))
         < (
      SELECT COALESCE(SUM(
        s.net_amount - COALESCE(s.paid_amount, 0) - COALESCE(s.sale_return_adjust, 0)
      ), 0)
      FROM public.sales s
      WHERE s.customer_id = c.id
        AND s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
        AND s.payment_status IN ('pending', 'partial')
        AND COALESCE(s.is_cancelled, false) = false
        AND s.deleted_at IS NULL
    ) - 0.5
      THEN 'PARTIAL — credit < pending'
    ELSE 'OK — full FIFO settlement expected'
  END AS repair_flag
FROM public.customers c
WHERE c.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND c.deleted_at IS NULL
  AND c.customer_name IN (
    'AMNA DARVESH', 'Muskan', 'Sharmin Mewara',
    'GULNAZ', 'MAHENOOR KAS', 'Amrin', 'OSAMA',
    'QURRATUL AIN BANGALORE', 'Shanawaz Memon',
    'Mahi Supariwala', 'Ruby Bhatia',
    'KHADIJA SHEIKH', 'FIZA CHAUDHARY',
    'SAMEENA MADHIYA', 'PRIYANKA YADAV',
    'Naeem Mukadam', 'Nazbin Choudhury',
    'Hanif bhai', 'Sadiqa Faisal Khan',
    'Arezah Nathani', 'Sadiya Surat',
    'AYESHA MERCHANT', 'SABINA SAMEER'
  )
ORDER BY total_pending_on_invoices DESC;


-- -----------------------------------------------------------------------------
-- QUERY 2 — Idempotency check (abort repair if > 0)
-- -----------------------------------------------------------------------------
SELECT COUNT(*) AS already_repaired
FROM public.voucher_entries ve
WHERE ve.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND ve.payment_method = 'balance_adjustment'
  AND ve.deleted_at IS NULL
  AND (
    COALESCE(ve.description, '') LIKE '%phantom_cn_repair_2026%'
    OR COALESCE(ve.notes, '') LIKE '%phantom_cn_repair_2026%'
  );


-- -----------------------------------------------------------------------------
-- QUERY 3 — Confirm exact customer IDs (expect 23 rows)
-- -----------------------------------------------------------------------------
SELECT id, customer_name, phone
FROM public.customers
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND deleted_at IS NULL
  AND customer_name IN (
    'AMNA DARVESH', 'Muskan', 'Sharmin Mewara',
    'GULNAZ', 'MAHENOOR KAS', 'Amrin', 'OSAMA',
    'QURRATUL AIN BANGALORE', 'Shanawaz Memon',
    'Mahi Supariwala', 'Ruby Bhatia',
    'KHADIJA SHEIKH', 'FIZA CHAUDHARY',
    'SAMEENA MADHIYA', 'PRIYANKA YADAV',
    'Naeem Mukadam', 'Nazbin Choudhury',
    'Hanif bhai', 'Sadiqa Faisal Khan',
    'Arezah Nathani', 'Sadiya Surat',
    'AYESHA MERCHANT', 'SABINA SAMEER'
  )
ORDER BY customer_name;

-- If row count < 23, find near-matches:
SELECT customer_name
FROM public.customers
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND deleted_at IS NULL
  AND (
    customer_name ILIKE ANY (ARRAY[
      '%AMNA%', '%Muskan%', '%Sharmin%', '%GULNAZ%', '%MAHENOOR%',
      '%Amrin%', '%OSAMA%', '%QURRATUL%', '%Shanawaz%', '%Mahi%',
      '%Ruby%', '%KHADIJA%', '%FIZA%', '%SAMEENA%', '%PRIYANKA%',
      '%Naeem%', '%Nazbin%', '%Hanif%', '%Sadiqa%', '%Arezah%',
      '%Sadiya%', '%AYESHA%', '%SABINA%'
    ])
  )
  AND customer_name NOT IN (
    'AMNA DARVESH', 'Muskan', 'Sharmin Mewara',
    'GULNAZ', 'MAHENOOR KAS', 'Amrin', 'OSAMA',
    'QURRATUL AIN BANGALORE', 'Shanawaz Memon',
    'Mahi Supariwala', 'Ruby Bhatia',
    'KHADIJA SHEIKH', 'FIZA CHAUDHARY',
    'SAMEENA MADHIYA', 'PRIYANKA YADAV',
    'Naeem Mukadam', 'Nazbin Choudhury',
    'Hanif bhai', 'Sadiqa Faisal Khan',
    'Arezah Nathani', 'Sadiya Surat',
    'AYESHA MERCHANT', 'SABINA SAMEER'
  )
ORDER BY customer_name;
