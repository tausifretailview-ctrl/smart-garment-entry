-- Fix sales.paid_amount / payment_status sync to match the post-adjust net model
-- used by the app reconciler (reconcileSaleInvoiceDisplay) and reconcile_customer_balances.
--
-- Two bugs fixed here:
--   1. Double-subtract of sale_return_adjust: sales.net_amount is stored POST-adjust
--      (payable AFTER the billing return). The old trigger capped paid at (net - sra),
--      subtracting the return a SECOND time, so an adjusted-but-unpaid invoice
--      (net 1,000, sra 1,000, ₹0 cash) was treated as fully settled.
--   2. Phantom credit-note double-credit: a credit_note_adjustment receipt that merely
--      duplicates the billing return (the SHAHIN PATEL pattern: SR adjusted at billing
--      AND its CN later applied to the same invoice) was counted as a real payment.
--      We now only count the CN portion that exceeds sale_return_adjust (cnNotInSr),
--      mirroring the client reconciler.
--
-- Shared helper keeps the trigger branches + data-repair backfill in lockstep.

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

  -- net_amount is already post-adjust: payable = net (do NOT subtract sra again).
  v_payable_cap := GREATEST(0, COALESCE(v_net, 0));

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

CREATE OR REPLACE FUNCTION public.sync_sale_payment_status_from_receipts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_row public.voucher_entries%ROWTYPE;
  v_org_id uuid;
  v_cust_id uuid;
  v_desc text;
  v_sale_id uuid;
  v_calc RECORD;
BEGIN
  IF TG_OP = 'DELETE' THEN
    v_row := OLD;
  ELSE
    v_row := NEW;
  END IF;

  IF v_row.voucher_type IS DISTINCT FROM 'receipt' OR v_row.reference_id IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Sale-linked receipts (incl. legacy rows: reference_type customer + reference_id = sale id)
  IF v_row.reference_type = 'sale'
     OR (v_row.reference_type = 'customer' AND EXISTS (
       SELECT 1 FROM public.sales s
       WHERE s.id = v_row.reference_id AND s.organization_id = v_row.organization_id
     )) THEN
    v_sale_id := v_row.reference_id;

    SELECT * INTO v_calc FROM public.compute_sale_settlement(v_sale_id, v_row.organization_id);
    IF v_calc.new_paid IS NOT NULL THEN
      UPDATE public.sales
      SET paid_amount = v_calc.new_paid,
          payment_status = v_calc.new_status
      WHERE id = v_sale_id
        AND organization_id = v_row.organization_id
        AND (
          ABS(COALESCE(paid_amount, 0) - v_calc.new_paid) > 0.009
          OR COALESCE(payment_status, '') <> v_calc.new_status
        );
    END IF;
  END IF;

  -- Customer-keyed receipts: match invoice numbers in description for that customer
  IF v_row.reference_type = 'customer'
     AND EXISTS (
       SELECT 1 FROM public.customers c
       WHERE c.id = v_row.reference_id AND c.organization_id = v_row.organization_id
     ) THEN
    v_org_id := v_row.organization_id;
    v_cust_id := v_row.reference_id;
    v_desc := COALESCE(v_row.description, '');

    FOR v_sale_id IN
      SELECT s.id
      FROM public.sales s
      WHERE s.organization_id = v_org_id
        AND s.customer_id = v_cust_id
        AND s.deleted_at IS NULL
        AND COALESCE(s.is_cancelled, false) = false
        AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
        AND s.sale_number IS NOT NULL
        AND POSITION(UPPER(s.sale_number) IN UPPER(v_desc)) > 0
    LOOP
      SELECT * INTO v_calc FROM public.compute_sale_settlement(v_sale_id, v_org_id);
      IF v_calc.new_paid IS NOT NULL THEN
        UPDATE public.sales
        SET paid_amount = v_calc.new_paid,
            payment_status = v_calc.new_status
        WHERE id = v_sale_id
          AND organization_id = v_org_id
          AND (
            ABS(COALESCE(paid_amount, 0) - v_calc.new_paid) > 0.009
            OR COALESCE(payment_status, '') <> v_calc.new_status
          );
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_sync_sale_payment_status_from_receipts ON public.voucher_entries;
CREATE TRIGGER trg_sync_sale_payment_status_from_receipts
AFTER INSERT OR UPDATE OR DELETE ON public.voucher_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_payment_status_from_receipts();

-- One-time idempotent backfill: align existing stale paid_amount / payment_status with
-- the corrected model. Only rows whose value actually changes are touched.
-- Scoped to the target organization; remove the organization_id filter to backfill all orgs.
-- Postgres does not allow referencing the UPDATE target table inside a FROM-clause
-- function (LATERAL on the target). Compute via a CTE, then update by id.
WITH recomputed AS (
  SELECT
    s.id,
    s.paid_amount AS old_paid,
    s.payment_status AS old_status,
    c.new_paid,
    c.new_status
  FROM public.sales s
  CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) AS c
  WHERE s.organization_id = '5e769632-a203-4a47-9d52-8c2bbdd1b23b'
    AND s.deleted_at IS NULL
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
  );
