-- Customer Balances speed fix (2026-10-15). Run once in the SQL editor: paste the whole file, run.
-- Repo copy of the live fix (not a migration: live body differs from the migration history; see
-- test/money/partyRpcCnMemoFix.test.ts, which pins the last migration copy). Applied by hand in the SQL editor.
-- Same balance query, same numbers. Only HOW the database runs it changes.
-- Why: as a plain SQL function it was planned once without knowing the shop, so it guessed
-- "1 bill" and recomputed all bill item totals once per bill (KS FOOTWEAR: about 3,700 times,
-- several minutes). Run directly it takes 0.44 s. Now the query is planned on every call with the
-- real shop id (plpgsql RETURN QUERY EXECUTE ... USING), so it gets the 0.44 s plan.
-- Org access check is kept (_assert_org_access). Undo: customer-balances-speed-undo-2026-10-15.sql.txt
-- The last SELECT runs it for KS FOOTWEAR: expect ks_parties = 214, back in about a second.

CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows(p_organization_id uuid, p_search text DEFAULT NULL::text)
 RETURNS TABLE(out_customer_id uuid, out_customer_name text, out_signed_balance numeric, out_advance_available numeric, out_direction text, out_net_position numeric, out_total_dr numeric, out_total_cr numeric, out_net_receivable numeric)
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_temp'
AS $fn$
BEGIN
  PERFORM public._assert_org_access(p_organization_id);
  RETURN QUERY EXECUTE $q$
  WITH
  cust AS (
    SELECT
      c.id,
      c.customer_name,
      COALESCE(c.opening_balance, 0)::numeric AS opening_balance
    FROM public.customers c
    WHERE c.organization_id = $1
      AND c.deleted_at IS NULL
      AND (
        COALESCE(NULLIF(btrim($2), ''), '') = ''
        OR c.customer_name ILIKE '%' || btrim($2) || '%'
        OR COALESCE(c.phone, '') ILIKE '%' || btrim($2) || '%'
      )
  ),
  items_gross AS (
    SELECT
      si.sale_id,
      SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0))::numeric AS gross
    FROM public.sale_items si
    INNER JOIN public.sales s2
      ON s2.id = si.sale_id
     AND s2.organization_id = $1
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  valid_sales AS (
    SELECT s.*
    FROM public.sales s
    WHERE s.organization_id = $1
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
      AND s.customer_id IN (SELECT id FROM cust)
  ),
  org_sales_ref AS (
    SELECT
      s.id AS sale_id,
      trim(s.id::text) AS ref_trim,
      s.customer_id
    FROM public.sales s
    WHERE s.organization_id = $1
      AND s.deleted_at IS NULL
      AND s.customer_id IS NOT NULL
  ),
  balance_adjustment AS (
    SELECT
      cba.customer_id,
      COALESCE(SUM(cba.outstanding_difference), 0)::numeric AS amt
    FROM public.customer_balance_adjustments cba
    WHERE cba.organization_id = $1
    GROUP BY cba.customer_id
  ),
  total_invoiced AS (
    SELECT
      s.customer_id,
      COALESCE(SUM(s.net_amount), 0)::numeric AS amt
    FROM valid_sales s
    GROUP BY s.customer_id
  ),
  sale_return_adjust AS (
    SELECT
      s.customer_id,
      COALESCE(SUM(
        CASE
          WHEN COALESCE(ig.gross, 0) > 0
               AND COALESCE(s.sale_return_adjust, 0) > 0
               AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1 /* cn-header-gate */ AND NOT ( COALESCE(s.gross_amount, 0) > 0 AND ABS(s.net_amount - (COALESCE(s.gross_amount, 0) - (COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0) + COALESCE(s.points_redeemed_amount, 0)) + COALESCE(s.round_off, 0))) <= 0.5 /* cn-header-gate-v2 */ )
          THEN 0
          ELSE COALESCE(s.sale_return_adjust, 0)
        END
      ), 0)::numeric AS amt
    FROM valid_sales s
    LEFT JOIN items_gross ig ON ig.sale_id = s.id
    GROUP BY s.customer_id
  ),
  receipt_voucher_base AS (
    SELECT
      ve.reference_id AS ref_id,
      trim(COALESCE(ve.reference_id::text, '')) AS ref_trim,
      lower(COALESCE(ve.reference_type, '')) AS ref_type,
      GREATEST(
        0::numeric,
        COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
      )::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = $1
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND trim(COALESCE(ve.reference_id::text, '')) <> ''
      AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  ),
  receipt_payments AS (
    SELECT u.cust_id, COALESCE(SUM(u.amt), 0)::numeric AS amt
    FROM (
      SELECT osr.customer_id AS cust_id, rvb.amt
      FROM receipt_voucher_base rvb
      INNER JOIN org_sales_ref osr ON osr.sale_id = rvb.ref_id
      UNION ALL
      SELECT c.id AS cust_id, rvb.amt
      FROM receipt_voucher_base rvb
      INNER JOIN cust c ON c.id = rvb.ref_id
      WHERE rvb.ref_type = 'customer'
        AND NOT EXISTS (
          SELECT 1 FROM org_sales_ref osr2 WHERE osr2.sale_id = rvb.ref_id
        )
    ) u
    WHERE u.cust_id IS NOT NULL
    GROUP BY u.cust_id
  ),
  sale_receipt_settlement AS (
    SELECT * FROM public._org_sale_receipt_settlement_by_sale($1)
  ),
  sale_drift_rows AS (
    SELECT
      s.customer_id,
      GREATEST(
        0::numeric,
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
        - COALESCE(srs.settled_amt, 0)
      )::numeric AS drift
    FROM valid_sales s
    LEFT JOIN sale_receipt_settlement srs ON srs.sale_id = s.id
    WHERE (
      GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0)
    ) > 0.005
  ),
  paid_at_sale_drift AS (
    SELECT
      sdr.customer_id AS cust_id,
      COALESCE(SUM(sdr.drift), 0)::numeric AS amt
    FROM sale_drift_rows sdr
    WHERE sdr.drift > 0
    GROUP BY sdr.customer_id
  ),
  pending_sale_returns AS (
    SELECT
      rem.out_customer_id AS customer_id,
      COALESCE(SUM(rem.remaining), 0)::numeric AS amt
    FROM public._org_sale_return_balance_remaining($1) rem
    WHERE rem.remaining > 0.005
    GROUP BY rem.out_customer_id
  ),
  credit_note_vouchers AS (
    SELECT
      ve.reference_id::uuid AS customer_id,
      COALESCE(SUM(
        GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
      ), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = $1
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    GROUP BY ve.reference_id::uuid
  ),
  customer_payment_refunds AS (
    SELECT
      ve.reference_id::uuid AS customer_id,
      COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0)::numeric AS amt
    FROM public.voucher_entries ve
    WHERE ve.organization_id = $1
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) = 'customer'
      AND NOT public._is_pos_exchange_refund_on_bill(ve.organization_id, ve.description)
    GROUP BY ve.reference_id::uuid
  ),
  customer_advance_totals AS (
    SELECT
      ca.customer_id AS cust_id,
      COALESCE(SUM(ca.amount), 0)::numeric AS total_amount,
      COALESCE(SUM(ca.used_amount), 0)::numeric AS total_used,
      COALESCE(SUM(ca.manual_used_amount), 0)::numeric AS total_manual
    FROM public.customer_advances ca
    WHERE ca.organization_id = $1
    GROUP BY ca.customer_id
  ),
  customer_advance_refund_totals AS (
    SELECT
      ca.customer_id AS cust_id,
      COALESCE(SUM(ar.refund_amount), 0)::numeric AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = $1
    GROUP BY ca.customer_id
  ),
  customer_advance_pools AS (
    SELECT
      COALESCE(cat.cust_id, crt.cust_id) AS cust_id,
      (COALESCE(cat.total_used, 0) - COALESCE(cat.total_manual, 0))::numeric AS total_used,
      GREATEST(
        0::numeric,
        COALESCE(cat.total_amount, 0)
          - COALESCE(cat.total_used, 0)
          - COALESCE(crt.total_refunds, 0)
      )::numeric AS unused_pool
    FROM customer_advance_totals cat
    FULL OUTER JOIN customer_advance_refund_totals crt ON crt.cust_id = cat.cust_id
  ),
  balances AS (
    SELECT
      c.id AS cust_id,
      c.customer_name AS party_name,
      ROUND((
        c.opening_balance
        + COALESCE(ba.amt, 0)
        + COALESCE(ti.amt, 0)
        - COALESCE(sra.amt, 0)
        - COALESCE(rp.amt, 0)
        - COALESCE(psd.amt, 0)
        - COALESCE(psr.amt, 0)
        - COALESCE(cn.amt, 0)
        + COALESCE(cpr.amt, 0)
        - COALESCE(cap.total_used, 0)
        - COALESCE(cap.unused_pool, 0)
      )::numeric, 2) AS bal_signed,
      ROUND(COALESCE(cap.unused_pool, 0)::numeric, 2) AS unused_advance_pool
    FROM cust c
    LEFT JOIN balance_adjustment ba ON ba.customer_id = c.id
    LEFT JOIN total_invoiced ti ON ti.customer_id = c.id
    LEFT JOIN sale_return_adjust sra ON sra.customer_id = c.id
    LEFT JOIN receipt_payments rp ON rp.cust_id = c.id
    LEFT JOIN paid_at_sale_drift psd ON psd.cust_id = c.id
    LEFT JOIN pending_sale_returns psr ON psr.customer_id = c.id
    LEFT JOIN credit_note_vouchers cn ON cn.customer_id = c.id
    LEFT JOIN customer_payment_refunds cpr ON cpr.customer_id = c.id
    LEFT JOIN customer_advance_pools cap ON cap.cust_id = c.id
  ),
  with_facets AS (
    SELECT
      b.cust_id,
      b.party_name,
      b.bal_signed,
      b.unused_advance_pool,
      CASE
        WHEN b.bal_signed > 0.5 THEN 'Dr'
        WHEN b.bal_signed < -0.5 THEN 'Cr'
        ELSE 'Settled'
      END AS dir_label,
      ROUND((b.bal_signed - b.unused_advance_pool)::numeric, 2) AS net_pos
    FROM balances b
  )
  SELECT
    wf.cust_id::uuid,
    wf.party_name::text,
    wf.bal_signed::numeric,
    wf.unused_advance_pool::numeric,
    wf.dir_label::text,
    wf.net_pos::numeric,
    ROUND(COALESCE(SUM(GREATEST(wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(GREATEST(-wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(wf.bal_signed) OVER (), 0)::numeric, 2)
  FROM with_facets wf
  ORDER BY wf.party_name
$q$ USING p_organization_id, p_search;
END;
$fn$;

SELECT count(*) AS ks_parties,
       round(sum(out_signed_balance), 2) AS ks_net_signed_total
FROM public._get_customer_party_balances_rows('4bc73037-e877-4123-9261-eb6e3876698c'::uuid, NULL);
