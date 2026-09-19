-- Full 51-set sibling SNAP-drop scan — tables only, READ ONLY.
-- organizations has NO deleted_at (42703). Org ids are literals.
-- Do not call get_customer_financial_snapshot* / party RPCs (42501).
-- Paste as ONE run. Do not click Format SQL first.
-- No INSERT/UPDATE/DELETE. No 51-bill mutate.
--
-- Repair membership = leftover-SUM over-credit, not GREATEST(receipts, tender).
-- GREATEST is what undercounted VIMLA / SANTOSH / SHREEVASTAV's extra ₹1,000.
--   over_credit_ledger = GREATEST(0, non-memo receipts + tender − (net − SRA))
--   repair bill if over_credit_ledger > 1
--
-- receipts_after ≈ receipts_live − over_credit_ledger (excess cash removed).
-- SNAP drop (bucket g): tender > 0.005 AND receipts_effective >= tender.
-- Sibling = any OTHER sale on the same customer (even if not in the repair set).
--
-- Gates:
--   SANTOSH_SEPARATE       — POS/717 customer; 1131-1 leftover-overpay, not A/B
--   WALK_IN_NO_CUSTOMER    — no customer_id (Velvet POS/85)
--   NEEDS_BUCKET_G         — SNAP drop on repaired bill after OR any sibling
--   REPAIR_SUFFICIENT_SNAP — no SNAP drop on self after and no sibling SNAP drop
--                            (still not a mutate green light — reprints / full paste)
--
-- Four orgs that built the 51 headline: GURUKRUPA, VELVET, ELLA NOOR, KS FOOTWEAR.

WITH org_ids AS (
  SELECT unnest(ARRAY[
    'e8fbf0d8-182c-4364-8570-96c756b72db8'::uuid, -- GURUKRUPA
    'dafc3d0c-874e-4784-bac3-5eab5f3c85b5'::uuid, -- VELVET
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid, -- ELLA NOOR
    '4bc73037-e877-4123-9261-eb6e3876698c'::uuid  -- KS FOOTWEAR
  ]) AS id
),
sale_base AS (
  SELECT
    s.id,
    s.organization_id,
    s.customer_id,
    s.sale_number,
    COALESCE(s.net_amount, 0) AS net_amount,
    COALESCE(s.sale_return_adjust, 0) AS sra,
    COALESCE(s.paid_amount, 0) AS paid_amount,
    GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0) AS tender
  FROM public.sales s
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
    AND s.organization_id IN (SELECT id FROM org_ids)
),
receipts AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))) AS amt
  FROM public.voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.organization_id IN (SELECT id FROM org_ids)
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY ve.organization_id, ve.reference_id
),
sale_cash AS (
  SELECT
    sb.*,
    COALESCE(r.amt, 0) AS receipts_live,
    GREATEST(0::numeric, sb.net_amount - sb.sra) AS net_due,
    GREATEST(
      0::numeric,
      COALESCE(r.amt, 0) + sb.tender - GREATEST(0::numeric, sb.net_amount - sb.sra)
    ) AS over_credit_ledger,
    GREATEST(
      0::numeric,
      GREATEST(COALESCE(r.amt, 0), sb.tender) - GREATEST(0::numeric, sb.net_amount - sb.sra)
    ) AS over_credit_greatest
  FROM sale_base sb
  LEFT JOIN receipts r
    ON r.sale_id::text = sb.id::text
   AND r.organization_id = sb.organization_id
),
repair_bills AS (
  SELECT
    sc.*,
    GREATEST(0::numeric, sc.receipts_live - sc.over_credit_ledger) AS receipts_after
  FROM sale_cash sc
  WHERE sc.over_credit_ledger > 1
),
repair_customers AS (
  SELECT DISTINCT customer_id
  FROM repair_bills
  WHERE customer_id IS NOT NULL
),
-- Every sale on a repair-set customer, with receipts_after on repair bills
customer_sales AS (
  SELECT
    sc.id,
    sc.organization_id,
    sc.customer_id,
    sc.sale_number,
    sc.tender,
    sc.receipts_live,
    sc.over_credit_ledger,
    CASE
      WHEN rb.id IS NOT NULL THEN GREATEST(0::numeric, sc.receipts_live - rb.over_credit_ledger)
      ELSE sc.receipts_live
    END AS receipts_effective,
    (rb.id IS NOT NULL) AS is_repair_bill
  FROM sale_cash sc
  JOIN repair_customers rc ON rc.customer_id = sc.customer_id
  LEFT JOIN repair_bills rb ON rb.id = sc.id
),
customer_sales_drop AS (
  SELECT
    cs.*,
    CASE
      WHEN cs.tender > 0.005 AND cs.receipts_effective >= cs.tender THEN cs.tender
      ELSE 0
    END AS snap_drop
  FROM customer_sales cs
),
sibling_totals AS (
  SELECT
    customer_id,
    SUM(snap_drop) FILTER (WHERE is_repair_bill = false) AS sibling_snap_drop,
    COUNT(*) FILTER (WHERE is_repair_bill = false AND snap_drop > 0) AS sibling_snap_bills
  FROM customer_sales_drop
  GROUP BY customer_id
),
classified AS (
  SELECT
    rb.sale_number,
    rb.customer_id,
    rb.tender,
    rb.paid_amount,
    rb.receipts_live,
    rb.over_credit_ledger,
    rb.over_credit_greatest,
    rb.receipts_after,
    CASE
      WHEN rb.tender > 0.005 AND rb.receipts_after >= rb.tender THEN rb.tender
      ELSE 0
    END AS snap_drop_self,
    COALESCE(st.sibling_snap_drop, 0) AS sibling_snap_drop,
    COALESCE(st.sibling_snap_bills, 0) AS sibling_snap_bills,
    CASE
      WHEN rb.customer_id = '1167547a-2ef1-4931-8993-2cb21ebcb619'::uuid
        OR rb.sale_number IN ('POS/25-26/717', 'POS/25-26/1130')
        THEN 'SANTOSH_SEPARATE'
      WHEN rb.customer_id IS NULL THEN 'WALK_IN_NO_CUSTOMER'
      WHEN (
        (rb.tender > 0.005 AND rb.receipts_after >= rb.tender)
        OR COALESCE(st.sibling_snap_drop, 0) > 0
      ) THEN 'NEEDS_BUCKET_G'
      ELSE 'REPAIR_SUFFICIENT_SNAP'
    END AS gate
  FROM repair_bills rb
  LEFT JOIN sibling_totals st ON st.customer_id = rb.customer_id
)
SELECT
  'headline'::text AS section,
  NULL::text AS gate,
  NULL::text AS sale_number,
  NULL::uuid AS customer_id,
  COUNT(*)::numeric AS tender,
  SUM(over_credit_ledger) AS paid_amount,
  COUNT(*) FILTER (WHERE gate = 'NEEDS_BUCKET_G')::numeric AS receipts_live,
  COUNT(*) FILTER (WHERE gate = 'REPAIR_SUFFICIENT_SNAP')::numeric AS over_credit_ledger,
  COUNT(*) FILTER (WHERE gate = 'SANTOSH_SEPARATE')::numeric AS over_credit_greatest,
  COUNT(*) FILTER (WHERE gate = 'WALK_IN_NO_CUSTOMER')::numeric AS receipts_after,
  NULL::numeric AS snap_drop_self,
  NULL::numeric AS sibling_snap_drop,
  NULL::int AS sibling_snap_bills
FROM classified
UNION ALL
SELECT
  'bill',
  gate,
  sale_number,
  customer_id,
  tender,
  paid_amount,
  receipts_live,
  over_credit_ledger,
  over_credit_greatest,
  receipts_after,
  snap_drop_self,
  sibling_snap_drop,
  sibling_snap_bills
FROM classified
UNION ALL
SELECT
  'sibling',
  NULL,
  csd.sale_number,
  csd.customer_id,
  csd.tender,
  NULL,
  csd.receipts_live,
  csd.over_credit_ledger,
  NULL,
  csd.receipts_effective,
  csd.snap_drop,
  NULL,
  NULL
FROM customer_sales_drop csd
WHERE csd.is_repair_bill = false
  AND csd.snap_drop > 0
ORDER BY 1, 2 NULLS LAST, 3 NULLS LAST;
