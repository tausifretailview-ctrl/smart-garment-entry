-- Give a credit note its balance back when the bill that used it is deleted,
-- cancelled, or has its credit released.
--
-- Production today: soft_delete_sale / cancel_invoice / release_sale_credit soft-delete
-- the credit_note_adjustment voucher and call restore_linked_returns_after_credit_release,
-- but nothing lowers credit_notes.used_amount (trg_cn_adjust_sync from
-- 20260606140000 is not installed in production; adjust_invoice_balance raises
-- used_amount directly). Result seen on ADEEBAAREEBA, 30-09-2026: POS/26-27/451 was
-- deleted, CN/26-27/18 stayed 'fully_used' at 4200, the linked return was left
-- 'adjusted' with 0 available, and the customer's credit was lost.
--
-- Fix: restore_linked_returns_after_credit_release (already called by all three
-- entry points right after they soft-delete the adjustment vouchers) now first
-- reverses the credit-note usage recorded in invoice_adjustments for that sale.
--   * Only the amount of vouchers soft-deleted in THIS transaction (deleted_at = now())
--     is released, so re-running or unrelated old adjustments are never double released.
--   * invoice_adjustments.released_at marks rows already reversed.
--   * Advance adjustments are untouched (trg_sync_customer_advances_used recomputes those).
--
-- Additive and idempotent. Apply in the SQL editor after testing in the DEMO org.

ALTER TABLE public.invoice_adjustments
  ADD COLUMN IF NOT EXISTS released_at timestamptz;

CREATE OR REPLACE FUNCTION public.restore_linked_returns_after_credit_release(p_sale_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_to_release numeric;
  v_adj        RECORD;
  v_take       numeric;
BEGIN
  -- security review 2026-09-27: organisation guard
  PERFORM public._assert_row_org_access('public.sales'::regclass, p_sale_id);

  -- Credit-note adjustment vouchers the caller soft-deleted in this transaction.
  SELECT COALESCE(SUM(v.total_amount), 0)
    INTO v_to_release
    FROM public.voucher_entries v
   WHERE v.reference_id = p_sale_id
     AND v.payment_method = 'credit_note_adjustment'
     AND v.deleted_at = now();

  IF v_to_release > 0.005 THEN
    FOR v_adj IN
      SELECT ia.id, ia.source_document_id, ia.amount_applied
        FROM public.invoice_adjustments ia
       WHERE ia.invoice_id = p_sale_id
         AND ia.adjustment_type = 'CREDIT_NOTE'
         AND ia.released_at IS NULL
       ORDER BY ia.created_at DESC, ia.id DESC
    LOOP
      EXIT WHEN v_to_release <= 0.005;
      v_take := LEAST(v_to_release, COALESCE(v_adj.amount_applied, 0));
      IF v_take <= 0.005 THEN
        CONTINUE;
      END IF;

      UPDATE public.credit_notes cn
         SET used_amount = GREATEST(0, COALESCE(cn.used_amount, 0) - v_take),
             status = CASE
                        WHEN GREATEST(0, COALESCE(cn.used_amount, 0) - v_take) <= 0.01 THEN 'active'
                        WHEN COALESCE(cn.credit_amount, 0)
                             - GREATEST(0, COALESCE(cn.used_amount, 0) - v_take) <= 0.01 THEN 'fully_used'
                        ELSE 'partially_used'
                      END,
             updated_at = now()
       WHERE cn.id = v_adj.source_document_id
         AND cn.deleted_at IS NULL;

      UPDATE public.invoice_adjustments SET released_at = now() WHERE id = v_adj.id;
      v_to_release := v_to_release - v_take;
    END LOOP;
  END IF;

  UPDATE public.sale_returns sr
     SET credit_available_balance = GREATEST(
           0,
           COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)
         ),
         credit_status = CASE
           WHEN GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) <= 0.01
             THEN 'adjusted'
           WHEN GREATEST(0, COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)) + 0.01
                < COALESCE(sr.net_amount, 0)
             THEN 'partially_adjusted'
           ELSE 'pending'
         END,
         linked_sale_id = NULL
    FROM public.credit_notes cn
   WHERE sr.linked_sale_id = p_sale_id
     AND sr.deleted_at IS NULL
     AND sr.credit_status IN ('adjusted', 'partially_adjusted')
     AND cn.id = sr.credit_note_id
     AND cn.deleted_at IS NULL;
END;
$function$;

-- Demo-org check (run as a member of the DEMO org; do not use a live tenant):
--   1. Make a return (credit note CN-A, 1000) and a POS bill that applies it.
--   2. select used_amount, status from credit_notes where id = '<CN-A>';  -- 1000 / fully_used
--   3. Delete the bill from POS Dashboard.
--   4. Same select -> 0 / active, and the return shows 'pending' with 1000 available.
--   5. select released_at from invoice_adjustments where source_document_id = '<CN-A>'; -- set
