-- Universal gated fix for the two sales `net_amount` conventions.
--
-- Problem (ASHIFA HUSSAIN / ELLA NOOR): some invoices store `net_amount` as the FULL bill
-- (pre-return) and the sale return is applied ON TOP via `sale_return_adjust` (no
-- credit_note_adjustment voucher). The settlement helper and the master reconciler both
-- assumed `net_amount` was already POST-return, so:
--   * compute_sale_settlement ignored sale_return_adjust -> invoice showed "Not Paid"/"Partial"
--     even though the applied return fully settled it.
--   * reconcile_customer_balances added sale_return_adjust back to invoices AND subtracted the
--     sale_returns row -> the two cancelled, so the return never credited the customer
--     (e.g. ASHIFA showed Rs.6,500 Dr instead of Rs.0).
--
-- Fix: distinguish the conventions with the merchandise gross (Σ mrp × qty from sale_items):
--   * pre-return  : net + sale_return_adjust > items_gross  -> subtract the applied return once
--   * post-return : net + sale_return_adjust ≤ items_gross  -> leave as-is (POS exchange /
--                   billing return already baked into net; SHAHIN PATEL case). NO regression.
-- The guard only fires when items_gross is known (> 0), so legacy/imported invoices without
-- line items keep the prior behavior.

-- 1) Settlement helper: cap payable by the applied return for pre-return invoices.
CREATE OR REPLACE FUNCTION public.compute_sale_settlement(p_sale_id uuid, p_org_id uuid)
RETURNS TABLE(new_paid numeric, new_status text)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_net numeric;
  v_sra numeric;
  v_tender numeric;
  v_non_cn numeric;
  v_cn numeric;
  v_genuine_cn numeric;
  v_receipt_total numeric;
  v_payable_cap numeric;
  v_items_gross numeric;
BEGIN
  SELECT s.net_amount,
         COALESCE(s.sale_return_adjust, 0),
         COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
    INTO v_net, v_sra, v_tender
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold');

  IF NOT FOUND THEN
    RETURN; -- no eligible row; caller leaves the sale untouched
  END IF;

  -- Merchandise gross (Σ mrp × qty) for the pre/post-return discriminator.
  SELECT COALESCE(SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)), 0)
    INTO v_items_gross
  FROM public.sale_items si
  WHERE si.sale_id = p_sale_id
    AND si.deleted_at IS NULL;

  SELECT
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN 0
                      ELSE COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0) END), 0),
    COALESCE(SUM(CASE WHEN LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
                      THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                      ELSE 0 END), 0)
    INTO v_non_cn, v_cn
  FROM public.voucher_entries ve
  WHERE ve.reference_id = p_sale_id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type IN ('sale', 'customer')
    AND ve.organization_id = p_org_id
    AND ve.deleted_at IS NULL;

  -- CN that only duplicates the billing return is not a real payment.
  v_genuine_cn := GREATEST(0, v_cn - v_sra);
  v_receipt_total := v_non_cn + v_genuine_cn;

  -- Pre-return invoice: net is the full bill and the return was applied on top
  -- (net + sra > items_gross). Subtract the applied return once. For post-return /
  -- exchange rows (net + sra ≤ items_gross) keep net (legacy behavior, no regression).
  -- Only applied when items_gross is known (> 0).
  IF v_sra > 0
     AND COALESCE(v_items_gross, 0) > 0
     AND COALESCE(v_net, 0) + v_sra > COALESCE(v_items_gross, 0) + 1 THEN
    v_payable_cap := GREATEST(0, COALESCE(v_net, 0) - v_sra);
  ELSE
    v_payable_cap := GREATEST(0, COALESCE(v_net, 0));
  END IF;

  IF COALESCE(v_tender, 0) > v_receipt_total + 0.0001 THEN
    new_paid := LEAST(v_payable_cap, GREATEST(v_receipt_total, v_tender));
  ELSE
    new_paid := LEAST(v_payable_cap, v_receipt_total);
  END IF;

  IF v_payable_cap <= 0.5 THEN
    new_status := 'completed';
  ELSIF new_paid >= v_payable_cap - 1 THEN
    new_status := 'completed';
  ELSIF new_paid > 0 THEN
    new_status := 'partial';
  ELSE
    new_status := 'pending';
  END IF;

  RETURN NEXT;
END;
$$;

-- 2) Master reconciler: stop double-representing returns that were applied on top of a
--    full-bill invoice. Add sale_return_adjust back to invoices ONLY for post-return rows
--    (where it was genuinely removed from net); for pre-return rows it stays out so the
--    sale_returns row credits the customer exactly once.
DROP FUNCTION IF EXISTS public.reconcile_customer_balances(UUID);

CREATE OR REPLACE FUNCTION public.reconcile_customer_balances(p_organization_id UUID)
RETURNS TABLE(
  customer_id UUID,
  customer_name TEXT,
  phone TEXT,
  total_invoices NUMERIC,
  total_cash_payments NUMERIC,
  total_advances NUMERIC,
  total_advance_used NUMERIC,
  total_sale_returns NUMERIC,
  total_refunds_paid NUMERIC,
  calculated_balance NUMERIC,
  advance_available NUMERIC,
  notes TEXT
) LANGUAGE sql STABLE SECURITY DEFINER SET search_path = 'public' AS $$
  WITH
  items AS (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM sale_items si
    JOIN sales s2 ON s2.id = si.sale_id
    WHERE s2.organization_id = p_organization_id
      AND si.deleted_at IS NULL
    GROUP BY si.sale_id
  ),
  inv AS (
    SELECT s.customer_id,
      SUM(
        s.net_amount
        + CASE
            -- Pre-return (net is the full bill, return applied on top): do NOT add sra,
            -- the sale_returns row below credits it once. Only when items_gross is known.
            WHEN COALESCE(it.gross, 0) > 0
                 AND COALESCE(s.sale_return_adjust, 0) > 0
                 AND s.net_amount + COALESCE(s.sale_return_adjust, 0) > it.gross + 1
            THEN 0
            -- Post-return (sra was removed from net): add it back to recover the gross bill.
            ELSE COALESCE(s.sale_return_adjust, 0)
          END
      ) AS total
    FROM sales s
    LEFT JOIN items it ON it.sale_id = s.id
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND s.payment_status NOT IN ('cancelled', 'hold')
      AND s.customer_id IS NOT NULL
    GROUP BY s.customer_id
  ),
  cash_pay AS (
    SELECT s.customer_id, SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)) AS total
    FROM voucher_entries ve
    JOIN sales s ON s.id = ve.reference_id
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type IN ('sale','SALE','CustomerReceipt')
      AND s.deleted_at IS NULL
      AND COALESCE(ve.payment_method, '') NOT IN ('advance_adjustment', 'credit_note_adjustment')
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%credit note adjusted%'
    GROUP BY s.customer_id
  ),
  open_pay AS (
    SELECT ve.reference_id AS cust_id, SUM(ve.total_amount + COALESCE(ve.discount_amount, 0)) AS total
    FROM voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'receipt'
      AND ve.reference_type IN ('customer','customer_payment','CustomerReceipt')
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%adjusted from advance balance%'
      AND LOWER(COALESCE(ve.description, '')) NOT LIKE '%credit note adjusted%'
    GROUP BY ve.reference_id
  ),
  adv AS (
    SELECT ca.customer_id,
      SUM(ca.amount) AS total_amount,
      SUM(ca.used_amount) AS total_used
    FROM customer_advances ca
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  ret AS (
    SELECT sr.customer_id, SUM(sr.net_amount) AS total
    FROM sale_returns sr
    WHERE sr.organization_id = p_organization_id
      AND sr.deleted_at IS NULL
      AND sr.customer_id IS NOT NULL
    GROUP BY sr.customer_id
  ),
  adv_ref AS (
    SELECT ca.customer_id, SUM(ar.refund_amount) AS total
    FROM advance_refunds ar
    JOIN customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.organization_id = p_organization_id
    GROUP BY ca.customer_id
  ),
  ref_vouch AS (
    SELECT ve.reference_id AS cust_id, SUM(ve.total_amount) AS total
    FROM voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND ve.voucher_type = 'payment'
      AND ve.reference_type = 'customer'
    GROUP BY ve.reference_id
  ),
  adj AS (
    SELECT cba.customer_id, SUM(cba.outstanding_difference) AS total
    FROM customer_balance_adjustments cba
    WHERE cba.organization_id = p_organization_id
    GROUP BY cba.customer_id
  ),
  cust AS (
    SELECT cu.id, cu.customer_name, cu.phone, COALESCE(cu.opening_balance, 0) AS opening_balance
    FROM customers cu
    WHERE cu.organization_id = p_organization_id
      AND cu.deleted_at IS NULL
  )
  SELECT
    c.id AS customer_id,
    c.customer_name,
    c.phone,
    COALESCE(i.total, 0) AS total_invoices,
    COALESCE(cp.total, 0) + COALESCE(op.total, 0) AS total_cash_payments,
    COALESCE(a.total_amount, 0) AS total_advances,
    COALESCE(a.total_used, 0) AS total_advance_used,
    COALESCE(r.total, 0) AS total_sale_returns,
    COALESCE(arf.total, 0) + COALESCE(rv.total, 0) AS total_refunds_paid,
    (c.opening_balance
     + COALESCE(i.total, 0)
     - COALESCE(cp.total, 0) - COALESCE(op.total, 0)
     - COALESCE(a.total_amount, 0)
     - COALESCE(r.total, 0)
     + COALESCE(arf.total, 0)
     + COALESCE(rv.total, 0)
     + COALESCE(ad.total, 0)
    )::NUMERIC AS calculated_balance,
    GREATEST(0, COALESCE(a.total_amount, 0) - COALESCE(a.total_used, 0) - COALESCE(arf.total, 0))::NUMERIC AS advance_available,
    CASE
      WHEN (c.opening_balance + COALESCE(i.total, 0) - COALESCE(cp.total, 0) - COALESCE(op.total, 0)
           - COALESCE(a.total_amount, 0) - COALESCE(r.total, 0) + COALESCE(arf.total, 0) + COALESCE(rv.total, 0) + COALESCE(ad.total, 0)) > 0
      THEN 'Dr (Customer owes)'
      WHEN (c.opening_balance + COALESCE(i.total, 0) - COALESCE(cp.total, 0) - COALESCE(op.total, 0)
           - COALESCE(a.total_amount, 0) - COALESCE(r.total, 0) + COALESCE(arf.total, 0) + COALESCE(rv.total, 0) + COALESCE(ad.total, 0)) < 0
      THEN 'Cr (Overpaid/Advance)'
      ELSE 'Settled'
    END AS notes
  FROM cust c
  LEFT JOIN inv i ON i.customer_id = c.id
  LEFT JOIN cash_pay cp ON cp.customer_id = c.id
  LEFT JOIN open_pay op ON op.cust_id = c.id
  LEFT JOIN adv a ON a.customer_id = c.id
  LEFT JOIN ret r ON r.customer_id = c.id
  LEFT JOIN adv_ref arf ON arf.customer_id = c.id
  LEFT JOIN ref_vouch rv ON rv.cust_id = c.id
  LEFT JOIN adj ad ON ad.customer_id = c.id
  WHERE COALESCE(i.total, 0) > 0 OR COALESCE(a.total_amount, 0) > 0 OR c.opening_balance != 0
  ORDER BY c.customer_name;
$$;

-- 2b) Lifetime snapshot reconciler (reconcile_customer_balance, SINGULAR) — feeds
--     get_customer_true_outstanding -> get_customer_financial_snapshot, which powers the
--     Settle Customer Account "Outstanding" card and customer pickers. Gate the
--     sale_return_adjust_on_invoices credit on items_gross so it mirrors the per-invoice
--     reconciler, the client core, and the plural reconcile_customer_balances:
--       * pre-return (net + sra > items_gross) -> subtract sra once  (ASHIFA: -> Rs.0)
--       * post-return (net + sra ≤ items_gross) -> subtract 0 (net already net of return;
--                                                   no double credit, SHAHIN PATEL safe)
--       * unknown gross (no line items)         -> subtract sra (prior behavior; no regression)
CREATE OR REPLACE FUNCTION public.reconcile_customer_balance(
  p_customer_id uuid,
  p_organization_id uuid
)
RETURNS TABLE (
  source text,
  amount numeric,
  detail text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF NOT EXISTS (
    SELECT 1
    FROM public.customers c
    WHERE c.id = p_customer_id
      AND c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ) THEN
    RAISE EXCEPTION 'Customer not found in organization' USING ERRCODE = 'P0002';
  END IF;

  RETURN QUERY
  SELECT
    'opening_balance'::text,
    COALESCE(
      (SELECT c.opening_balance FROM public.customers c
       WHERE c.id = p_customer_id AND c.organization_id = p_organization_id AND c.deleted_at IS NULL),
      0
    )::numeric,
    'customers.opening_balance'::text;

  RETURN QUERY
  SELECT
    'balance_adjustment'::text,
    COALESCE(SUM(cba.outstanding_difference), 0)::numeric,
    'customer_balance_adjustments (sum outstanding_difference)'::text
  FROM public.customer_balance_adjustments cba
  WHERE cba.customer_id = p_customer_id
    AND cba.organization_id = p_organization_id;

  RETURN QUERY
  SELECT
    'total_invoiced'::text,
    COALESCE(SUM(s.net_amount), 0)::numeric,
    'sales.net_amount (excl cancelled/hold)'::text
  FROM public.sales s
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT
    'sale_return_adjust_on_invoices'::text,
    (-COALESCE(SUM(
      CASE
        -- Post-return invoice: net is ALREADY net of the return (net + sra ≤ items_gross).
        -- Subtracting sra here would double-credit, so contribute 0.
        WHEN COALESCE(ig.gross, 0) > 0
             AND COALESCE(s.sale_return_adjust, 0) > 0
             AND s.net_amount + COALESCE(s.sale_return_adjust, 0) <= ig.gross + 1
        THEN 0
        -- Pre-return (full bill, return applied on top) OR unknown gross (legacy):
        -- subtract sra so the applied return reduces the receivable exactly once.
        ELSE COALESCE(s.sale_return_adjust, 0)
      END
    ), 0))::numeric,
    'sales.sale_return_adjust gated on items_gross (pre-return / legacy only)'::text
  FROM public.sales s
  LEFT JOIN (
    SELECT si.sale_id, SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)) AS gross
    FROM public.sale_items si
    WHERE si.deleted_at IS NULL
    GROUP BY si.sale_id
  ) ig ON ig.sale_id = s.id
  WHERE s.customer_id = p_customer_id
    AND s.organization_id = p_organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

  RETURN QUERY
  SELECT
    'receipt_payments'::text,
    (-COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0))::numeric,
    'voucher_entries receipt (sale-linked or opening; excl advance_application)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND NOT (
      lower(COALESCE(ve.reference_type, '')) = 'sale'
      AND (
        lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment'
        OR lower(trim(COALESCE(ve.description, ''))) LIKE 'adjusted from advance balance%'
      )
    )
    AND (
      EXISTS (
        SELECT 1
        FROM public.sales s
        WHERE s.organization_id = p_organization_id
          AND s.deleted_at IS NULL
          AND s.customer_id = p_customer_id
          AND s.id::text = ve.reference_id::text
      )
      OR (
        lower(COALESCE(ve.reference_type, '')) = 'customer'
        AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text)
        AND NOT EXISTS (
          SELECT 1 FROM public.sales s2 WHERE s2.id::text = ve.reference_id::text
        )
      )
    );

  RETURN QUERY
  SELECT
    'paid_at_sale_drift'::text,
    (-COALESCE(SUM(sub.drift), 0))::numeric,
    'POS pay-at-sale minus receipt vouchers on same sale (cash + settlement discount)'::text
  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(
        COALESCE(s.paid_amount, 0),
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
      )
      - COALESCE((
        SELECT SUM(
          GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
        )
        FROM public.voucher_entries ve
        WHERE ve.organization_id = p_organization_id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
      ), 0)
    ) AS drift
    FROM public.sales s
    WHERE s.customer_id = p_customer_id
      AND s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
      AND COALESCE(s.is_cancelled, false) = false
      AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold')
  ) sub
  WHERE sub.drift > 0;

  RETURN QUERY
  SELECT
    'pending_sale_returns'::text,
    (-COALESCE(SUM(
      GREATEST(
        0::numeric,
        COALESCE(sr.net_amount, 0)
          - COALESCE(
            (
              SELECT s.sale_return_adjust
              FROM public.sales s
              WHERE s.id = sr.linked_sale_id
                AND s.organization_id = p_organization_id
                AND s.deleted_at IS NULL
            ),
            0
          )
      )
    ), 0))::numeric,
    'sale_returns pending — net of sale_return_adjust already on linked invoice'::text
  FROM public.sale_returns sr
  WHERE sr.customer_id = p_customer_id
    AND sr.organization_id = p_organization_id
    AND sr.deleted_at IS NULL
    AND lower(trim(COALESCE(sr.credit_status, ''))) = 'pending';

  RETURN QUERY
  SELECT
    'credit_note_vouchers'::text,
    (-COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0))::numeric,
    'voucher_entries type=credit_note ref=customer'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text);

  RETURN QUERY
  SELECT
    'customer_payment_refunds'::text,
    (-COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0))::numeric,
    'voucher_entries type=payment ref=customer (reduces receivable)'::text
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
    AND lower(COALESCE(ve.reference_type, '')) = 'customer'
    AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text);

  RETURN QUERY
  SELECT
    'advances_applied'::text,
    (-COALESCE(SUM(ca.used_amount), 0))::numeric,
    'customer_advances.used_amount'::text
  FROM public.customer_advances ca
  WHERE ca.customer_id = p_customer_id
    AND ca.organization_id = p_organization_id;

  RETURN QUERY
  WITH adv AS (
    SELECT COALESCE(SUM(ca.amount), 0) AS total_amount,
           COALESCE(SUM(ca.used_amount), 0) AS total_used
    FROM public.customer_advances ca
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  ),
  ref AS (
    SELECT COALESCE(SUM(ar.refund_amount), 0) AS total_refunds
    FROM public.advance_refunds ar
    INNER JOIN public.customer_advances ca ON ca.id = ar.advance_id
    WHERE ca.customer_id = p_customer_id
      AND ca.organization_id = p_organization_id
  )
  SELECT
    'unused_advances'::text,
    (-GREATEST(
      0::numeric,
      (SELECT total_amount - total_used FROM adv) - (SELECT total_refunds FROM ref)
    ))::numeric,
    'customer_advances unused net of refunds (matches customerAuditMath)'::text;

  RETURN;
END;
$$;

-- 3) One-time idempotent backfill of paid_amount / payment_status across ALL organizations.
--    Safe to run org-wide because the guards below make it strictly non-regressive.
--
--    STRONG COVER FOR PAID INVOICES — a bulk resync must NEVER touch a genuinely settled
--    invoice. compute_sale_settlement only sees sale-referenced receipts + the sale's own
--    tender columns; when a payment was recorded as a customer-keyed receipt with no tender
--    on the sale row it would compute paid = 0 and wrongly flip a "completed" invoice to
--    "pending". The two guards below make the backfill strictly NON-REGRESSIVE:
--      (a) never move a 'completed' invoice to a less-settled status;
--      (b) never reduce a recorded paid_amount unless the row ends fully settled
--          (e.g. settled by an applied return — the ELLA NOOR fix, which raises settlement).
--    The live trigger (compute_sale_settlement) is intentionally left pure so receipt
--    deletions still reduce paid_amount correctly on real events.
-- Postgres does not allow referencing the UPDATE target table inside a FROM-clause
-- function (LATERAL on the target). Compute via a CTE that joins LATERAL against a
-- plain `sales` scan, then update by id.
WITH recomputed AS (
  SELECT
    s.id,
    s.paid_amount AS old_paid,
    s.payment_status AS old_status,
    c.new_paid,
    c.new_status
  FROM public.sales s
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) AS c
  WHERE s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
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
