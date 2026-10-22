-- Activity log: every invoice and purchase bill, for every login (admins too).
--
-- Builds on 20270113120000_operator_activity_log.sql. Nothing in the log ever
-- skipped admin or owner logins; what was missing was whole kinds of entries:
--
-- 1. Sales: every saved bill now writes SALE_CREATED (before, only discounted
--    bills wrote DISCOUNT_GIVEN). A held bill that is completed later writes
--    SALE_CREATED at that moment. Cancel / un-cancel are named
--    (SALE_CANCELLED / SALE_UNCANCELLED) and the cancel reason and salesman are
--    kept, so a shared admin login still shows who sold the bill.
-- 2. Purchase bills: the INSERT trigger was dropped in 2026-04, so new purchase
--    bills were never logged. PURCHASE_CREATED is back, and edits now name
--    PURCHASE_DELETED / PURCHASE_RESTORED / PURCHASE_CANCELLED with bill no.,
--    supplier invoice no., date and amounts, and the shop's organization id
--    (before, the row went to the user's first shop).
-- 3. Purchase returns: PURCHASE_RETURN_CREATED / _UPDATED / _DELETED / _RESTORED.
--
-- 4. Saves that only write payment / totals fields within 60 s of the bill being
--    created are logged as SALE_AUTO_UPDATED / PURCHASE_AUTO_UPDATED, so
--    "Invoice edits" lists only real edits (the app hid these on the client).
-- 5. Recycle-bin permanent deletes (rows already soft deleted) are logged as
--    SALE_PERMANENTLY_DELETED / PURCHASE_PERMANENTLY_DELETED / PURCHASE_RETURN_DELETED. Hard
--    deletes of live rows (only Reset Organization Data does that, and it clears
--    its own log rows) are not logged.
--
-- All writes go through log_audit_safe, so a failed log write never blocks a save.
-- Re-runnable.

-- ---------------------------------------------------------------------------
-- 0. Non-blocking wrapper (same as 20270113120000, repeated so this file runs alone)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.log_audit_safe(
  p_action text,
  p_entity_type text,
  p_entity_id uuid,
  p_old_values jsonb,
  p_new_values jsonb,
  p_metadata jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  PERFORM public.log_audit(p_action, p_entity_type, p_entity_id, p_old_values, p_new_values, p_metadata);
EXCEPTION WHEN OTHERS THEN
  NULL;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.log_audit_safe(text, text, uuid, jsonb, jsonb, jsonb) FROM PUBLIC, anon, authenticated;

-- ---------------------------------------------------------------------------
-- 1. Sales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_sales_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := jsonb_build_object(
      'sale_number', OLD.sale_number,
      'sale_type', OLD.sale_type,
      'sale_date', OLD.sale_date,
      'customer_name', OLD.customer_name,
      'salesman', OLD.salesman,
      'gross_amount', OLD.gross_amount,
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
      'payment_method', OLD.payment_method,
      'is_cancelled', OLD.is_cancelled,
      'cancelled_reason', OLD.cancelled_reason,
      'deleted_at', OLD.deleted_at
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := jsonb_build_object(
      'sale_number', NEW.sale_number,
      'sale_type', NEW.sale_type,
      'sale_date', NEW.sale_date,
      'customer_name', NEW.customer_name,
      'salesman', NEW.salesman,
      'gross_amount', NEW.gross_amount,
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
      'payment_method', NEW.payment_method,
      'is_cancelled', NEW.is_cancelled,
      'cancelled_reason', NEW.cancelled_reason,
      'deleted_at', NEW.deleted_at
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_safe(
      'SALE_CREATED',
      'sale',
      NEW.id,
      NULL,
      v_new,
      jsonb_build_object(
        'table', 'sales',
        'organization_id', NEW.organization_id,
        'has_discount', (COALESCE(NEW.discount_amount, 0) > 0
                         OR COALESCE(NEW.flat_discount_amount, 0) > 0
                         OR COALESCE(NEW.flat_discount_percent, 0) > 0)
      )
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'SALE_DELETED';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_action := 'SALE_RESTORED';
    ELSIF COALESCE(OLD.is_cancelled, false) = false AND COALESCE(NEW.is_cancelled, false) = true THEN
      v_action := 'SALE_CANCELLED';
    ELSIF COALESCE(OLD.is_cancelled, false) = true AND COALESCE(NEW.is_cancelled, false) = false THEN
      v_action := 'SALE_UNCANCELLED';
    ELSIF OLD.payment_status = 'hold' AND NEW.payment_status IS DISTINCT FROM 'hold' THEN
      v_action := 'SALE_CREATED';
    ELSIF now() - NEW.created_at < interval '60 seconds' THEN
      v_action := 'SALE_AUTO_UPDATED';
    ELSE
      v_action := 'SALE_UPDATED';
    END IF;

    PERFORM public.log_audit_safe(
      v_action,
      'sale',
      NEW.id,
      CASE WHEN v_action = 'SALE_CREATED' THEN NULL ELSE v_old END,
      v_new,
      jsonb_build_object(
        'table', 'sales',
        'organization_id', NEW.organization_id,
        'seconds_since_created', round(EXTRACT(EPOCH FROM (now() - NEW.created_at))),
        'has_discount', (COALESCE(NEW.discount_amount, 0) > 0
                         OR COALESCE(NEW.flat_discount_amount, 0) > 0
                         OR COALESCE(NEW.flat_discount_percent, 0) > 0)
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_safe(
      'SALE_PERMANENTLY_DELETED',
      'sale',
      OLD.id,
      v_old,
      NULL,
      jsonb_build_object('table', 'sales', 'organization_id', OLD.organization_id)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

-- Every saved bill (held bills are logged when they are completed).
DROP TRIGGER IF EXISTS audit_sales_discount_insert_trigger ON public.sales;
DROP TRIGGER IF EXISTS audit_sales_insert_trigger ON public.sales;
CREATE TRIGGER audit_sales_insert_trigger
AFTER INSERT ON public.sales
FOR EACH ROW
WHEN (NEW.payment_status IS DISTINCT FROM 'hold')
EXECUTE FUNCTION public.audit_sales_changes();

-- Same column guard as 20261231140000, plus the cancel reason and salesman.
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
  OR OLD.salesman              IS DISTINCT FROM NEW.salesman
)
EXECUTE FUNCTION public.audit_sales_changes();

-- Recycle-bin permanent delete (bill was soft deleted first).
DROP TRIGGER IF EXISTS audit_sales_delete_trigger ON public.sales;
CREATE TRIGGER audit_sales_delete_trigger
AFTER DELETE ON public.sales
FOR EACH ROW
WHEN (OLD.deleted_at IS NOT NULL)
EXECUTE FUNCTION public.audit_sales_changes();

-- ---------------------------------------------------------------------------
-- 2. Purchase bills
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_purchase_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_old jsonb;
  v_new jsonb;
BEGIN
  IF TG_OP IN ('UPDATE', 'DELETE') THEN
    v_old := jsonb_build_object(
      'software_bill_no', OLD.software_bill_no,
      'supplier_invoice_no', OLD.supplier_invoice_no,
      'supplier_name', OLD.supplier_name,
      'bill_date', OLD.bill_date,
      'gross_amount', OLD.gross_amount,
      'discount_amount', OLD.discount_amount,
      'gst_amount', OLD.gst_amount,
      'other_charges', OLD.other_charges,
      'round_off', OLD.round_off,
      'net_amount', OLD.net_amount,
      'total_qty', OLD.total_qty,
      'is_cancelled', OLD.is_cancelled,
      'cancelled_reason', OLD.cancelled_reason,
      'deleted_at', OLD.deleted_at
    );
  END IF;

  IF TG_OP IN ('INSERT', 'UPDATE') THEN
    v_new := jsonb_build_object(
      'software_bill_no', NEW.software_bill_no,
      'supplier_invoice_no', NEW.supplier_invoice_no,
      'supplier_name', NEW.supplier_name,
      'bill_date', NEW.bill_date,
      'gross_amount', NEW.gross_amount,
      'discount_amount', NEW.discount_amount,
      'gst_amount', NEW.gst_amount,
      'other_charges', NEW.other_charges,
      'round_off', NEW.round_off,
      'net_amount', NEW.net_amount,
      'total_qty', NEW.total_qty,
      'is_cancelled', NEW.is_cancelled,
      'cancelled_reason', NEW.cancelled_reason,
      'deleted_at', NEW.deleted_at
    );
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'PURCHASE_CREATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'PURCHASE_PERMANENTLY_DELETED';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'PURCHASE_DELETED';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_action := 'PURCHASE_RESTORED';
  ELSIF COALESCE(OLD.is_cancelled, false) = false AND COALESCE(NEW.is_cancelled, false) = true THEN
    v_action := 'PURCHASE_CANCELLED';
  ELSIF now() - NEW.created_at < interval '60 seconds' THEN
    v_action := 'PURCHASE_AUTO_UPDATED';
  ELSE
    v_action := 'PURCHASE_UPDATED';
  END IF;

  PERFORM public.log_audit_safe(
    v_action,
    'purchase_bill',
    COALESCE(NEW.id, OLD.id),
    v_old,
    v_new,
    jsonb_build_object(
      'table', 'purchase_bills',
      'organization_id', COALESCE(NEW.organization_id, OLD.organization_id),
      'seconds_since_created', round(EXTRACT(EPOCH FROM (now() - COALESCE(NEW.created_at, OLD.created_at))))
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_purchase_insert_trigger ON public.purchase_bills;
CREATE TRIGGER audit_purchase_insert_trigger
AFTER INSERT ON public.purchase_bills
FOR EACH ROW
EXECUTE FUNCTION public.audit_purchase_changes();

DROP TRIGGER IF EXISTS audit_purchase_trigger ON public.purchase_bills;
CREATE TRIGGER audit_purchase_trigger
AFTER UPDATE ON public.purchase_bills
FOR EACH ROW
WHEN (
  OLD.net_amount             IS DISTINCT FROM NEW.net_amount
  OR OLD.gross_amount        IS DISTINCT FROM NEW.gross_amount
  OR OLD.discount_amount     IS DISTINCT FROM NEW.discount_amount
  OR OLD.gst_amount          IS DISTINCT FROM NEW.gst_amount
  OR OLD.other_charges       IS DISTINCT FROM NEW.other_charges
  OR OLD.round_off           IS DISTINCT FROM NEW.round_off
  OR OLD.supplier_id         IS DISTINCT FROM NEW.supplier_id
  OR OLD.supplier_name       IS DISTINCT FROM NEW.supplier_name
  OR OLD.supplier_invoice_no IS DISTINCT FROM NEW.supplier_invoice_no
  OR OLD.bill_date           IS DISTINCT FROM NEW.bill_date
  OR OLD.deleted_at          IS DISTINCT FROM NEW.deleted_at
  OR OLD.is_cancelled        IS DISTINCT FROM NEW.is_cancelled
  OR OLD.is_locked           IS DISTINCT FROM NEW.is_locked
  OR OLD.is_dc_purchase      IS DISTINCT FROM NEW.is_dc_purchase
)
EXECUTE FUNCTION public.audit_purchase_changes();

DROP TRIGGER IF EXISTS audit_purchase_delete_trigger ON public.purchase_bills;
CREATE TRIGGER audit_purchase_delete_trigger
AFTER DELETE ON public.purchase_bills
FOR EACH ROW
WHEN (OLD.deleted_at IS NOT NULL)
EXECUTE FUNCTION public.audit_purchase_changes();

-- ---------------------------------------------------------------------------
-- 3. Purchase returns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_purchase_return_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'PURCHASE_RETURN_CREATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'PURCHASE_RETURN_DELETED';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'PURCHASE_RETURN_DELETED';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_action := 'PURCHASE_RETURN_RESTORED';
  ELSE
    v_action := 'PURCHASE_RETURN_UPDATED';
  END IF;

  PERFORM public.log_audit_safe(
    v_action,
    'purchase_return',
    COALESCE(NEW.id, OLD.id),
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'return_number', OLD.return_number,
      'supplier_name', OLD.supplier_name,
      'return_date', OLD.return_date,
      'net_amount', OLD.net_amount,
      'original_bill_number', OLD.original_bill_number,
      'credit_status', OLD.credit_status,
      'deleted_at', OLD.deleted_at
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'return_number', NEW.return_number,
      'supplier_name', NEW.supplier_name,
      'return_date', NEW.return_date,
      'net_amount', NEW.net_amount,
      'original_bill_number', NEW.original_bill_number,
      'credit_status', NEW.credit_status,
      'deleted_at', NEW.deleted_at
    ) END,
    jsonb_build_object('table', 'purchase_returns', 'organization_id', COALESCE(NEW.organization_id, OLD.organization_id))
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_purchase_return_activity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS audit_purchase_return_insert_trigger ON public.purchase_returns;
CREATE TRIGGER audit_purchase_return_insert_trigger
AFTER INSERT ON public.purchase_returns
FOR EACH ROW
EXECUTE FUNCTION public.audit_purchase_return_activity();

DROP TRIGGER IF EXISTS audit_purchase_return_update_trigger ON public.purchase_returns;
CREATE TRIGGER audit_purchase_return_update_trigger
AFTER UPDATE ON public.purchase_returns
FOR EACH ROW
WHEN (
  OLD.net_amount       IS DISTINCT FROM NEW.net_amount
  OR OLD.deleted_at    IS DISTINCT FROM NEW.deleted_at
  OR OLD.supplier_id   IS DISTINCT FROM NEW.supplier_id
  OR OLD.return_date   IS DISTINCT FROM NEW.return_date
  OR OLD.credit_status IS DISTINCT FROM NEW.credit_status
)
EXECUTE FUNCTION public.audit_purchase_return_activity();

DROP TRIGGER IF EXISTS audit_purchase_return_delete_trigger ON public.purchase_returns;
CREATE TRIGGER audit_purchase_return_delete_trigger
AFTER DELETE ON public.purchase_returns
FOR EACH ROW
WHEN (OLD.deleted_at IS NOT NULL)
EXECUTE FUNCTION public.audit_purchase_return_activity();
