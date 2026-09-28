-- When a sale return is refunded to the customer, close its credit note too.
--
-- ZIBA (ADEEBAAREEBA): SR/26-27/32 refunded via "Mark as Refund" (PAY-02090, ₹700),
-- but CN/26-27/8 stayed status 'active' with used_amount 0. POS showed "Cr ₹700",
-- CN History showed "CN Remaining ₹700", and apply_credit_note_to_sale /
-- useCreditNotes (status = 'active') could hand the same ₹700 out again.
--
-- The refund paths (AdjustCustomerCreditNoteDialog, SaleReturnDashboard refund dialog)
-- only update sale_returns. A trigger here covers both, runs as definer (cashiers
-- cannot UPDATE credit_notes under RLS), and leaves used_amount alone so the
-- nightly CN drift check (vouchers vs used_amount) stays clean.
--
-- Existing refunded returns are NOT touched here; see the one-off fix SQL.

CREATE OR REPLACE FUNCTION public.trg_sale_return_refund_close_cn_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF NEW.credit_note_id IS NOT NULL
     AND NEW.deleted_at IS NULL
     AND lower(COALESCE(NEW.credit_status, '')) = 'refunded'
     AND lower(COALESCE(OLD.credit_status, '')) IS DISTINCT FROM 'refunded' THEN
    UPDATE public.credit_notes
       SET status = 'refunded',
           updated_at = NOW()
     WHERE id = NEW.credit_note_id
       AND organization_id = NEW.organization_id
       AND deleted_at IS NULL
       AND status IN ('active', 'partially_used');
  END IF;
  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.trg_sale_return_refund_close_cn_fn() FROM PUBLIC;

DROP TRIGGER IF EXISTS trg_sale_return_refund_close_cn ON public.sale_returns;
CREATE TRIGGER trg_sale_return_refund_close_cn
  AFTER UPDATE OF credit_status ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_sale_return_refund_close_cn_fn();
