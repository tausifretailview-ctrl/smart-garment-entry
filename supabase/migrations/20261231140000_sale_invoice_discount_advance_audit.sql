-- Sale Bill (Sale Invoice) edit audit: invoice discount, S/R adjust, advance adjust.
--
-- 20261230120000 widened SALE_UPDATED for the POS credit bug, but a Sale Invoice
-- keeps its invoice-level discount in flat_discount_amount / flat_discount_percent
-- (discount_amount is only the line-item total), and advance adjustment lives in
-- advance_adjustment receipt vouchers, not on the sales row. So editing a Sale Bill's
-- invoice discount, or adding/removing advance on it, left no before/after record.
--
-- 1. SALE_UPDATED also records flat_discount_amount, flat_discount_percent and
--    points_redeemed_amount, and fires when they change. Rows are now filed under
--    the sale's own organization (log_audit otherwise picks the editor's first org,
--    which hides the row from the bill's History when a user belongs to several).
-- 2. SALE_ADVANCE_ADJUST_UPDATED: whenever an advance_adjustment receipt voucher on a
--    sale is added, removed (soft or hard delete) or its amount changes, log the
--    sale's total advance adjusted before and after, with who/when from log_audit.
--
-- sale_return_adjust (S/R Adjust) is already audited by 20261230120000.

-- ---------------------------------------------------------------------------
-- 1. SALE_UPDATED: invoice discount fields + sale's organization
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_sales_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM log_audit(
      'SALE_CREATED',
      'sale',
      NEW.id,
      NULL,
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'customer_name', NEW.customer_name,
        'net_amount', NEW.net_amount,
        'payment_method', NEW.payment_method
      ),
      jsonb_build_object('table', 'sales', 'organization_id', NEW.organization_id)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'SALE_UPDATED',
      'sale',
      NEW.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'sale_type', OLD.sale_type,
        'net_amount', OLD.net_amount,
        'payment_status', OLD.payment_status,
        'discount_amount', OLD.discount_amount,
        'flat_discount_amount', OLD.flat_discount_amount,
        'flat_discount_percent', OLD.flat_discount_percent,
        'points_redeemed_amount', OLD.points_redeemed_amount,
        'sale_return_adjust', OLD.sale_return_adjust,
        'paid_amount', OLD.paid_amount,
        'cash_amount', OLD.cash_amount,
        'upi_amount', OLD.upi_amount,
        'card_amount', OLD.card_amount,
        'payment_method', OLD.payment_method
      ),
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'sale_type', NEW.sale_type,
        'net_amount', NEW.net_amount,
        'payment_status', NEW.payment_status,
        'discount_amount', NEW.discount_amount,
        'flat_discount_amount', NEW.flat_discount_amount,
        'flat_discount_percent', NEW.flat_discount_percent,
        'points_redeemed_amount', NEW.points_redeemed_amount,
        'sale_return_adjust', NEW.sale_return_adjust,
        'paid_amount', NEW.paid_amount,
        'cash_amount', NEW.cash_amount,
        'upi_amount', NEW.upi_amount,
        'card_amount', NEW.card_amount,
        'payment_method', NEW.payment_method
      ),
      jsonb_build_object('table', 'sales', 'organization_id', NEW.organization_id)
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM log_audit(
      'SALE_DELETED',
      'sale',
      OLD.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'customer_name', OLD.customer_name,
        'net_amount', OLD.net_amount
      ),
      NULL,
      jsonb_build_object('table', 'sales', 'organization_id', OLD.organization_id,
                         'warning', 'Sale deletion affects stock')
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_sales_trigger ON public.sales;
CREATE TRIGGER audit_sales_trigger
AFTER UPDATE ON public.sales
FOR EACH ROW
WHEN (
  OLD.net_amount               IS DISTINCT FROM NEW.net_amount
  OR OLD.gross_amount          IS DISTINCT FROM NEW.gross_amount
  OR OLD.discount_amount       IS DISTINCT FROM NEW.discount_amount
  OR OLD.flat_discount_amount  IS DISTINCT FROM NEW.flat_discount_amount
  OR OLD.flat_discount_percent IS DISTINCT FROM NEW.flat_discount_percent
  OR OLD.points_redeemed_amount IS DISTINCT FROM NEW.points_redeemed_amount
  OR OLD.other_charges         IS DISTINCT FROM NEW.other_charges
  OR OLD.round_off             IS DISTINCT FROM NEW.round_off
  OR OLD.customer_id           IS DISTINCT FROM NEW.customer_id
  OR OLD.customer_name         IS DISTINCT FROM NEW.customer_name
  OR OLD.sale_date             IS DISTINCT FROM NEW.sale_date
  OR OLD.payment_status        IS DISTINCT FROM NEW.payment_status
  OR OLD.sale_type             IS DISTINCT FROM NEW.sale_type
  OR OLD.deleted_at            IS DISTINCT FROM NEW.deleted_at
  OR OLD.is_cancelled          IS DISTINCT FROM NEW.is_cancelled
  OR OLD.sale_return_adjust    IS DISTINCT FROM NEW.sale_return_adjust
  OR OLD.paid_amount           IS DISTINCT FROM NEW.paid_amount
  OR OLD.cash_amount           IS DISTINCT FROM NEW.cash_amount
  OR OLD.upi_amount            IS DISTINCT FROM NEW.upi_amount
  OR OLD.card_amount           IS DISTINCT FROM NEW.card_amount
)
EXECUTE FUNCTION public.audit_sales_changes();

-- ---------------------------------------------------------------------------
-- 2. SALE_ADVANCE_ADJUST_UPDATED from advance_adjustment receipt vouchers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_sale_advance_adjust_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_old_live numeric := 0;
  v_new_live numeric := 0;
  v_delta numeric;
  v_total_now numeric;
  v_sale record;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE')
     AND OLD.payment_method = 'advance_adjustment'
     AND lower(COALESCE(OLD.voucher_type, '')) = 'receipt'
     AND OLD.deleted_at IS NULL THEN
    v_old_live := COALESCE(OLD.total_amount, 0);
    v_sale_id := OLD.reference_id;
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE')
     AND NEW.payment_method = 'advance_adjustment'
     AND lower(COALESCE(NEW.voucher_type, '')) = 'receipt'
     AND NEW.deleted_at IS NULL THEN
    v_new_live := COALESCE(NEW.total_amount, 0);
    v_sale_id := COALESCE(v_sale_id, NEW.reference_id);
  END IF;

  v_delta := v_new_live - v_old_live;
  IF v_sale_id IS NULL OR abs(v_delta) < 0.005 THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Customer-level (opening balance) advance vouchers reference a customer, not a sale.
  SELECT id, sale_number, sale_type, organization_id
    INTO v_sale
    FROM public.sales
   WHERE id = v_sale_id;
  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(ve.total_amount), 0)
    INTO v_total_now
    FROM public.voucher_entries ve
   WHERE ve.reference_id = v_sale_id
     AND ve.deleted_at IS NULL
     AND ve.payment_method = 'advance_adjustment'
     AND lower(COALESCE(ve.voucher_type, '')) = 'receipt';

  PERFORM log_audit(
    'SALE_ADVANCE_ADJUST_UPDATED',
    'sale',
    v_sale_id,
    jsonb_build_object(
      'sale_number', v_sale.sale_number,
      'sale_type', v_sale.sale_type,
      'advance_adjust', v_total_now - v_delta
    ),
    jsonb_build_object(
      'sale_number', v_sale.sale_number,
      'sale_type', v_sale.sale_type,
      'advance_adjust', v_total_now
    ),
    jsonb_build_object(
      'table', 'voucher_entries',
      'organization_id', v_sale.organization_id,
      'voucher_id', COALESCE(NEW.id, OLD.id),
      'voucher_number', COALESCE(NEW.voucher_number, OLD.voucher_number),
      'change', TG_OP
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_sale_advance_adjust_changes() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS audit_sale_advance_adjust_trigger ON public.voucher_entries;
CREATE TRIGGER audit_sale_advance_adjust_trigger
AFTER INSERT OR UPDATE OF total_amount, deleted_at, payment_method, reference_id OR DELETE
ON public.voucher_entries
FOR EACH ROW
EXECUTE FUNCTION public.audit_sale_advance_adjust_changes();
