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
-- Gates (CUSTOMER-level — a customer is NEEDS_BUCKET_G if ANY of her bills is):
--   SANTOSH_SEPARATE       — POS/717 customer; 1131-1 leftover-overpay, not A/B
--   WALK_IN_NO_CUSTOMER    — no customer_id (Velvet POS/85)
--   NEEDS_BUCKET_G         — SNAP drop survives on ANY sale of the customer after
--                            every repair bill has its over-credit removed
--   REPAIR_SUFFICIENT_SNAP — no SNAP drop anywhere on the customer after repair
--                            (still not a mutate green light — reprints / hand-check)
--
-- v3 (after the 22:01 dry-run review): same-day receipts are netted against at-sale
-- tender (printed-ledger rule). v2 counted a POS dual-write (cash_amount + same-day
-- receipt) as over-credit and as a SNAP drop — both wrong. The 21:09 CSV is v2 output
-- and its A/B split is PROVISIONAL until this v3 is pasted.
--
-- v2 (21:09 IST paste, 456 rows): first run gated PER BILL, so 54572eba had one
-- bill in each group. Now the gate is per customer. Also adds `shape` so the
-- tender-only rows (at-sale cash > net, receipts = 0, nothing to delete) and the
-- NET_DUE_ZERO rows (receipt standing on a fully-returned bill — refund, not a
-- duplicate) can be separated from the receipt-bearing duplicate population.
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
    (s.sale_date AT TIME ZONE 'Asia/Kolkata')::date AS sale_day,
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
-- v3: same-day receipts are netted against at-sale tender, the way the printed
-- Customer Ledger does (CustomerLedgerPage residualPaymentAtSaleTender, same-day
-- voucher_date only). A POS bill that dual-writes cash_amount AND a same-day
-- receipt is NOT over-credited; the 21:09 (v2) paste counted it twice.
receipts AS (
  SELECT
    ve.organization_id,
    ve.reference_id AS sale_id,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))) AS amt,
    SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)))
      FILTER (WHERE ve.voucher_date IS NOT DISTINCT FROM sb.sale_day) AS amt_same_day
  FROM public.voucher_entries ve
  JOIN sale_base sb
    ON sb.id::text = ve.reference_id::text
   AND sb.organization_id = ve.organization_id
  WHERE ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY ve.organization_id, ve.reference_id
),
sale_cash AS (
  SELECT
    sb.*,
    COALESCE(r.amt, 0) AS receipts_live,
    COALESCE(r.amt_same_day, 0) AS receipts_same_day,
    GREATEST(0::numeric, sb.tender - COALESCE(r.amt_same_day, 0)) AS tender_residual,
    GREATEST(0::numeric, sb.net_amount - sb.sra) AS net_due,
    GREATEST(
      0::numeric,
      COALESCE(r.amt, 0)
        + GREATEST(0::numeric, sb.tender - COALESCE(r.amt_same_day, 0))
        - GREATEST(0::numeric, sb.net_amount - sb.sra)
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
    sc.tender_residual,
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
-- Bucket (g): SNAP credits GREATEST(0, tender − all sale receipts). The at-sale money it
-- fails to credit is tender_residual − that drift. Zero on a dual-written bill (residual 0).
customer_sales_drop AS (
  SELECT
    cs.*,
    GREATEST(
      0::numeric,
      cs.tender_residual - GREATEST(0::numeric, cs.tender - cs.receipts_effective)
    ) AS snap_drop
  FROM customer_sales cs
),
-- Customer-level SNAP drop AFTER repair: every sale (repair bill or not).
customer_totals AS (
  SELECT
    customer_id,
    SUM(snap_drop) AS customer_snap_drop,
    COUNT(*) FILTER (WHERE snap_drop > 0) AS customer_snap_bills,
    COUNT(*) FILTER (WHERE is_repair_bill) AS repair_bill_count
  FROM customer_sales_drop
  GROUP BY customer_id
),
shaped AS (
  SELECT
    rb.*,
    rb.receipts_live - rb.net_due AS receipt_over,   -- > 1 → receipts alone exceed the bill
    GREATEST(
      0::numeric,
      rb.tender_residual - GREATEST(0::numeric, rb.tender - rb.receipts_after)
    ) AS snap_drop_self,
    CASE
      WHEN rb.receipts_live <= 0.005 THEN 'TENDER_ONLY_OVER'          -- no receipt to delete
      WHEN rb.net_due <= 0.005      THEN 'NET_DUE_ZERO'               -- fully returned; refund, not dup
      WHEN rb.tender <= 0.005 AND abs(rb.receipts_live - 2 * rb.net_due) <= 1
                                    THEN 'EXACT_DOUBLE_RECEIPT'
      WHEN rb.tender_residual > 0.005 AND rb.receipts_after <= 0.005
                                    THEN 'RECEIPT_DUPLICATES_AT_SALE_TENDER'
      WHEN rb.receipts_live - rb.net_due > 1
                                    THEN 'RECEIPT_OVER_PARTIAL'
      ELSE 'MIXED_TENDER_PLUS_RECEIPT_OVER'
    END AS shape
  FROM repair_bills rb
),
classified AS (
  SELECT
    s.sale_number,
    s.customer_id,
    s.tender,
    s.paid_amount,
    s.receipts_live,
    s.over_credit_ledger,
    s.over_credit_greatest,
    s.receipts_after,
    s.snap_drop_self,
    -- drop on every OTHER sale of the customer (siblings AND other repair bills, post-repair)
    COALESCE(ct.customer_snap_drop, 0) - s.snap_drop_self AS sibling_snap_drop,
    COALESCE(ct.customer_snap_bills, 0)
      - CASE WHEN s.snap_drop_self > 0 THEN 1 ELSE 0 END AS sibling_snap_bills,
    COALESCE(ct.repair_bill_count, 1) AS customer_repair_bills,
    s.shape,
    s.receipt_over,
    s.receipts_same_day,
    s.tender_residual,
    CASE
      WHEN s.customer_id = '1167547a-2ef1-4931-8993-2cb21ebcb619'::uuid
        OR s.sale_number IN ('POS/25-26/717', 'POS/25-26/1130')
        THEN 'SANTOSH_SEPARATE'
      WHEN s.customer_id IS NULL THEN 'WALK_IN_NO_CUSTOMER'
      WHEN COALESCE(ct.customer_snap_drop, 0) > 0 THEN 'NEEDS_BUCKET_G'
      ELSE 'REPAIR_SUFFICIENT_SNAP'
    END AS gate
  FROM shaped s
  LEFT JOIN customer_totals ct ON ct.customer_id = s.customer_id
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
  COUNT(*) FILTER (WHERE receipts_live > 0.005)::numeric AS snap_drop_self,       -- receipt-bearing bills
  SUM(over_credit_ledger) FILTER (WHERE receipts_live > 0.005) AS sibling_snap_drop, -- their over-credit
  NULL::int AS sibling_snap_bills,
  NULL::int AS customer_repair_bills,
  NULL::text AS shape,
  NULL::numeric AS receipt_over,
  NULL::numeric AS receipts_same_day,
  NULL::numeric AS tender_residual
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
  sibling_snap_bills,
  customer_repair_bills,
  shape,
  receipt_over,
  receipts_same_day,
  tender_residual
FROM classified
UNION ALL
SELECT
  'customer',
  gate,
  NULL,
  customer_id,
  COUNT(*)::numeric,                                   -- repair bills on this customer
  SUM(over_credit_ledger),                             -- customer over-credit
  COUNT(*) FILTER (WHERE receipts_live > 0.005)::numeric,
  NULL, NULL, NULL,
  SUM(snap_drop_self),
  MAX(sibling_snap_drop),
  NULL, NULL,
  string_agg(shape, '+' ORDER BY sale_number),
  NULL, NULL, NULL
FROM classified
WHERE customer_id IS NOT NULL
GROUP BY customer_id, gate
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
  NULL,
  NULL,
  NULL,
  NULL,
  NULL,
  csd.tender_residual
FROM customer_sales_drop csd
WHERE csd.is_repair_bill = false
  AND csd.snap_drop > 0
ORDER BY 1, 2 NULLS LAST, 4 NULLS LAST, 3 NULLS LAST;
