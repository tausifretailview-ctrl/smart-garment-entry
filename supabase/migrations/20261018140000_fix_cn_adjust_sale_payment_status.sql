-- Fix: Adjust Credit Note updates sale_return_adjust + payment_status, but
-- normalize_sale_payment_status_on_write / compute_sale_settlement then rewrite
-- status from paid_amount vs net_amount ONLY — ignoring SRA. Invoices stay
-- "pending" on Sales dashboard after CN apply.
--
-- Align status with adjust_invoice_balance / customer-accounts-consistency-v1:
--   settled_for_status = paid_amount + sale_return_adjust
--   payment_status from derive_sale_payment_status(net, settled_for_status)
-- paid_amount itself stays receipt/tender based (SRA must NOT be written into paid).

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
  v_payment_method text;
  v_settled_for_status numeric;
BEGIN
  SELECT s.net_amount,
         COALESCE(s.sale_return_adjust, 0),
         COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0),
         s.payment_method
    INTO v_net, v_sra, v_tender, v_payment_method
  FROM public.sales s
  WHERE s.id = p_sale_id
    AND s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold');

  IF NOT FOUND THEN
    RETURN;
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

  -- CN voucher that only audits sale_return_adjust must not inflate paid_amount.
  v_genuine_cn := GREATEST(0, v_cn - v_sra);
  v_receipt_total := v_non_cn + v_genuine_cn;
  v_payable_cap := GREATEST(0, COALESCE(v_net, 0));

  IF COALESCE(v_tender, 0) > v_receipt_total + 0.0001 THEN
    new_paid := LEAST(v_payable_cap, GREATEST(v_receipt_total, v_tender));
  ELSE
    new_paid := LEAST(v_payable_cap, v_receipt_total);
  END IF;

  -- Status includes SRA (Adjust CN / Option A). paid_amount stays cash-like only.
  v_settled_for_status := COALESCE(new_paid, 0) + COALESCE(v_sra, 0);
  new_status := public.derive_sale_payment_status(v_payable_cap, v_settled_for_status, v_payment_method);

  RETURN NEXT;
END;
$$;

COMMENT ON FUNCTION public.compute_sale_settlement(uuid, uuid) IS
  'Receipt/tender reconciler for sales.paid_amount. payment_status uses paid + sale_return_adjust '
  'vs net (matches adjust_invoice_balance). CN vouchers that duplicate SRA are not added to paid.';

CREATE OR REPLACE FUNCTION public.normalize_sale_payment_status_on_write()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_current text := lower(COALESCE(NEW.payment_status, ''));
  v_derived text;
  v_settled numeric;
BEGIN
  IF COALESCE(NEW.is_cancelled, false) THEN
    IF v_current <> 'cancelled' THEN
      NEW.payment_status := 'cancelled';
    END IF;
    RETURN NEW;
  END IF;

  IF v_current = 'hold' OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  -- Match adjust_invoice_balance: settled = paid_amount + sale_return_adjust.
  v_settled := GREATEST(0, COALESCE(NEW.paid_amount, 0))
             + GREATEST(0, COALESCE(NEW.sale_return_adjust, 0));

  v_derived := public.derive_sale_payment_status(
    NEW.net_amount,
    v_settled,
    NEW.payment_method
  );

  IF v_derived = 'completed' AND v_current = 'paid' THEN
    NEW.payment_status := 'completed';
    RETURN NEW;
  END IF;

  IF COALESCE(NEW.payment_status, '') IS DISTINCT FROM v_derived THEN
    NEW.payment_status := v_derived;
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.normalize_sale_payment_status_on_write() IS
  'BEFORE INSERT/UPDATE on sales: payment_status from (paid_amount + sale_return_adjust) vs net_amount '
  'using sale_settlement_tolerance. Prevents Adjust CN status from being forced back to pending.';

-- Prefer sale-face line_total for pre/post-return detection (MRP ≫ rate broke the gate).
CREATE OR REPLACE FUNCTION public.get_sale_items_gross_batch(p_sale_ids uuid[])
RETURNS TABLE(sale_id uuid, items_gross numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    si.sale_id,
    SUM(
      COALESCE(
        NULLIF(si.line_total, 0),
        COALESCE(si.unit_price, 0) * COALESCE(si.quantity, 0),
        COALESCE(si.mrp, 0) * COALESCE(si.quantity, 0)
      )
    )::numeric AS items_gross
  FROM public.sale_items si
  WHERE si.sale_id = ANY (COALESCE(p_sale_ids, ARRAY[]::uuid[]))
    AND si.deleted_at IS NULL
  GROUP BY si.sale_id;
$$;

COMMENT ON FUNCTION public.get_sale_items_gross_batch(uuid[]) IS
  'Per-sale merchandise face for balance reconcile: prefers Σ line_total, then unit_price×qty, then mrp×qty.';

-- Repair rows already stuck pending/partial after CN adjust (SRA applied, status ignored it).
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
    AND COALESCE(s.sale_return_adjust, 0) > 0.01
    AND c.new_paid IS NOT NULL
)
UPDATE public.sales s
SET paid_amount = r.new_paid,
    payment_status = r.new_status,
    updated_at = NOW()
FROM recomputed r
WHERE r.id = s.id
  AND (
    ABS(COALESCE(r.old_paid, 0) - r.new_paid) > 0.009
    OR COALESCE(r.old_status, '') <> r.new_status
  )
  -- Never demote a completed invoice during repair.
  AND NOT (COALESCE(r.old_status, '') IN ('completed', 'paid') AND r.new_status <> 'completed');
