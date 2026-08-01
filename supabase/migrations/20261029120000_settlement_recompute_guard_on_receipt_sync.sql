-- Item 1: stop settlement recomputes from re-stamping legacy_paid_baseline.
--
-- sync_sale_legacy_baseline() already skips when:
--   current_setting('app.settlement_recompute', true) = '1'
-- Nothing set that flag. Receipt sync UPDATEs sales.paid_amount and the BEFORE
-- trigger rewrote baseline from the (possibly inflated) paid value.
--
-- Wrap every UPDATE public.sales in sync_sale_payment_status_from_receipts with
-- a transaction-local set_config (third arg true) so the flag cannot leak across
-- pooled connections. Nested EXCEPTION blocks reset the flag on failure before
-- re-raising (transaction-local is discarded on abort anyway; this is belt-and-braces).
--
-- SECURITY DEFINER + SET search_path = public preserved exactly.
-- Does not touch sync_sale_legacy_baseline, compute_sale_settlement, or sales rows.
--
-- Base body: latest in-repo redefine
--   20260708120000_fix_sale_paid_sync_post_adjust_net_and_cn_dedupe.sql
-- If live DDL has diverged, re-apply this wrap on the live body before deploy.

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
      BEGIN
        PERFORM set_config('app.settlement_recompute', '1', true);
        UPDATE public.sales
        SET paid_amount = v_calc.new_paid,
            payment_status = v_calc.new_status
        WHERE id = v_sale_id
          AND organization_id = v_row.organization_id
          AND (
            ABS(COALESCE(paid_amount, 0) - v_calc.new_paid) > 0.009
            OR COALESCE(payment_status, '') <> v_calc.new_status
          );
        PERFORM set_config('app.settlement_recompute', '0', true);
      EXCEPTION WHEN OTHERS THEN
        PERFORM set_config('app.settlement_recompute', '0', true);
        RAISE;
      END;
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
        BEGIN
          PERFORM set_config('app.settlement_recompute', '1', true);
          UPDATE public.sales
          SET paid_amount = v_calc.new_paid,
              payment_status = v_calc.new_status
          WHERE id = v_sale_id
            AND organization_id = v_org_id
            AND (
              ABS(COALESCE(paid_amount, 0) - v_calc.new_paid) > 0.009
              OR COALESCE(payment_status, '') <> v_calc.new_status
            );
          PERFORM set_config('app.settlement_recompute', '0', true);
        EXCEPTION WHEN OTHERS THEN
          PERFORM set_config('app.settlement_recompute', '0', true);
          RAISE;
        END;
      END IF;
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

COMMENT ON FUNCTION public.sync_sale_payment_status_from_receipts() IS
  'AFTER INSERT/UPDATE/DELETE on voucher_entries: recompute sales.paid_amount / payment_status '
  'via compute_sale_settlement. Sets app.settlement_recompute=1 (transaction-local) around each '
  'sales UPDATE so trg_sales_legacy_baseline does not re-stamp legacy_paid_baseline from the '
  'recomputed paid_amount.';
