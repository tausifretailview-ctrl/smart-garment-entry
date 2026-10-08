-- Operator activity log: who did what, when, on bills, payments and credit notes.
--
-- Builds on the existing audit_logs table, log_audit() and the Audit Log page.
--
-- 1. log_audit_safe(): same arguments as log_audit, but swallows any error, so a
--    failed log write can never roll back the sale / payment / credit note save
--    that fired it. All triggers below use it, including the existing sales one.
-- 2. Sales: the UPDATE audit now names deletes, restores and cancels
--    (SALE_DELETED / SALE_RESTORED / SALE_CANCELLED instead of a bare
--    SALE_UPDATED), and records customer, date and seconds since the bill was
--    created. A new INSERT trigger logs DISCOUNT_GIVEN, only for bills saved with
--    an item or invoice discount (held bills excluded).
-- 3. voucher_entries (receipts, payments, expenses, CN vouchers):
--    PAYMENT_RECORDED / PAYMENT_UPDATED / PAYMENT_DELETED / PAYMENT_RESTORED.
-- 4. credit_notes: CREDIT_NOTE_CREATED / _UPDATED / _DELETED / _RESTORED.
-- 5. sale_returns: SALE_RETURN_CREATED / _UPDATED / _DELETED / _RESTORED.
--
-- Rows written with no signed-in user (cron, nightly repairs) are skipped for
-- 3-5: this is an operator log. UPDATE triggers fire only when an audited column
-- really changes, and the INSERT trigger on sales only for discounted bills, so a
-- plain POS sale gets no extra work.

-- ---------------------------------------------------------------------------
-- 1. Non-blocking wrapper
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
-- 2. Sales
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_sales_changes()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
BEGIN
  IF TG_OP = 'INSERT' THEN
    PERFORM public.log_audit_safe(
      'DISCOUNT_GIVEN',
      'sale',
      NEW.id,
      NULL,
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'sale_type', NEW.sale_type,
        'customer_name', NEW.customer_name,
        'gross_amount', NEW.gross_amount,
        'discount_amount', NEW.discount_amount,
        'flat_discount_amount', NEW.flat_discount_amount,
        'flat_discount_percent', NEW.flat_discount_percent,
        'net_amount', NEW.net_amount,
        'payment_method', NEW.payment_method
      ),
      jsonb_build_object('table', 'sales', 'organization_id', NEW.organization_id)
    );
  ELSIF TG_OP = 'UPDATE' THEN
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
      v_action := 'SALE_DELETED';
    ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
      v_action := 'SALE_RESTORED';
    ELSIF COALESCE(OLD.is_cancelled, false) = false AND COALESCE(NEW.is_cancelled, false) = true THEN
      v_action := 'SALE_CANCELLED';
    ELSE
      v_action := 'SALE_UPDATED';
    END IF;

    PERFORM public.log_audit_safe(
      v_action,
      'sale',
      NEW.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'sale_type', OLD.sale_type,
        'sale_date', OLD.sale_date,
        'customer_name', OLD.customer_name,
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
        'deleted_at', OLD.deleted_at
      ),
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'sale_type', NEW.sale_type,
        'sale_date', NEW.sale_date,
        'customer_name', NEW.customer_name,
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
        'deleted_at', NEW.deleted_at
      ),
      jsonb_build_object(
        'table', 'sales',
        'organization_id', NEW.organization_id,
        'seconds_since_created', round(EXTRACT(EPOCH FROM (now() - NEW.created_at)))
      )
    );
  ELSIF TG_OP = 'DELETE' THEN
    PERFORM public.log_audit_safe(
      'SALE_DELETED',
      'sale',
      OLD.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'customer_name', OLD.customer_name,
        'net_amount', OLD.net_amount
      ),
      NULL,
      jsonb_build_object('table', 'sales', 'organization_id', OLD.organization_id)
    );
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS audit_sales_discount_insert_trigger ON public.sales;
CREATE TRIGGER audit_sales_discount_insert_trigger
AFTER INSERT ON public.sales
FOR EACH ROW
WHEN (
  (COALESCE(NEW.discount_amount, 0) > 0
   OR COALESCE(NEW.flat_discount_amount, 0) > 0
   OR COALESCE(NEW.flat_discount_percent, 0) > 0)
  AND NEW.payment_status IS DISTINCT FROM 'hold'
)
EXECUTE FUNCTION public.audit_sales_changes();

-- audit_sales_trigger (AFTER UPDATE, column-guarded) from 20261231140000 is kept
-- as is; it now calls the function above.

-- ---------------------------------------------------------------------------
-- 3. Payments / vouchers
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_voucher_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_row public.voucher_entries%ROWTYPE;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'PAYMENT_RECORDED';
    v_row := NEW;
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'PAYMENT_DELETED';
    v_row := OLD;
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'PAYMENT_DELETED';
    v_row := NEW;
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_action := 'PAYMENT_RESTORED';
    v_row := NEW;
  ELSE
    v_action := 'PAYMENT_UPDATED';
    v_row := NEW;
  END IF;

  PERFORM public.log_audit_safe(
    v_action,
    'voucher',
    v_row.id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'voucher_number', OLD.voucher_number,
      'voucher_type', OLD.voucher_type,
      'voucher_date', OLD.voucher_date,
      'total_amount', OLD.total_amount,
      'discount_amount', OLD.discount_amount,
      'payment_method', OLD.payment_method,
      'reference_type', OLD.reference_type,
      'reference_id', OLD.reference_id,
      'description', OLD.description
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'voucher_number', NEW.voucher_number,
      'voucher_type', NEW.voucher_type,
      'voucher_date', NEW.voucher_date,
      'total_amount', NEW.total_amount,
      'discount_amount', NEW.discount_amount,
      'payment_method', NEW.payment_method,
      'reference_type', NEW.reference_type,
      'reference_id', NEW.reference_id,
      'description', NEW.description
    ) END,
    jsonb_build_object(
      'table', 'voucher_entries',
      'organization_id', v_row.organization_id,
      'voucher_type', v_row.voucher_type
    )
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_voucher_activity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS audit_voucher_insert_trigger ON public.voucher_entries;
CREATE TRIGGER audit_voucher_insert_trigger
AFTER INSERT ON public.voucher_entries
FOR EACH ROW
EXECUTE FUNCTION public.audit_voucher_activity();

DROP TRIGGER IF EXISTS audit_voucher_update_trigger ON public.voucher_entries;
CREATE TRIGGER audit_voucher_update_trigger
AFTER UPDATE ON public.voucher_entries
FOR EACH ROW
WHEN (
  OLD.total_amount       IS DISTINCT FROM NEW.total_amount
  OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
  OR OLD.deleted_at      IS DISTINCT FROM NEW.deleted_at
  OR OLD.payment_method  IS DISTINCT FROM NEW.payment_method
  OR OLD.reference_id    IS DISTINCT FROM NEW.reference_id
  OR OLD.voucher_date    IS DISTINCT FROM NEW.voucher_date
)
EXECUTE FUNCTION public.audit_voucher_activity();

DROP TRIGGER IF EXISTS audit_voucher_delete_trigger ON public.voucher_entries;
CREATE TRIGGER audit_voucher_delete_trigger
AFTER DELETE ON public.voucher_entries
FOR EACH ROW
EXECUTE FUNCTION public.audit_voucher_activity();

-- ---------------------------------------------------------------------------
-- 4. Credit notes
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_credit_note_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_id uuid;
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'CREDIT_NOTE_CREATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'CREDIT_NOTE_DELETED';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'CREDIT_NOTE_DELETED';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_action := 'CREDIT_NOTE_RESTORED';
  ELSE
    v_action := 'CREDIT_NOTE_UPDATED';
  END IF;

  v_id := COALESCE(NEW.id, OLD.id);
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);

  PERFORM public.log_audit_safe(
    v_action,
    'credit_note',
    v_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'credit_note_number', OLD.credit_note_number,
      'customer_name', OLD.customer_name,
      'credit_amount', OLD.credit_amount,
      'used_amount', OLD.used_amount,
      'status', OLD.status,
      'expiry_date', OLD.expiry_date,
      'sale_id', OLD.sale_id
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'credit_note_number', NEW.credit_note_number,
      'customer_name', NEW.customer_name,
      'credit_amount', NEW.credit_amount,
      'used_amount', NEW.used_amount,
      'status', NEW.status,
      'expiry_date', NEW.expiry_date,
      'sale_id', NEW.sale_id
    ) END,
    jsonb_build_object('table', 'credit_notes', 'organization_id', v_org)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_credit_note_activity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS audit_credit_note_insert_trigger ON public.credit_notes;
CREATE TRIGGER audit_credit_note_insert_trigger
AFTER INSERT ON public.credit_notes
FOR EACH ROW
EXECUTE FUNCTION public.audit_credit_note_activity();

DROP TRIGGER IF EXISTS audit_credit_note_update_trigger ON public.credit_notes;
CREATE TRIGGER audit_credit_note_update_trigger
AFTER UPDATE ON public.credit_notes
FOR EACH ROW
WHEN (
  OLD.credit_amount   IS DISTINCT FROM NEW.credit_amount
  OR OLD.used_amount  IS DISTINCT FROM NEW.used_amount
  OR OLD.status       IS DISTINCT FROM NEW.status
  OR OLD.deleted_at   IS DISTINCT FROM NEW.deleted_at
  OR OLD.customer_id  IS DISTINCT FROM NEW.customer_id
  OR OLD.expiry_date  IS DISTINCT FROM NEW.expiry_date
)
EXECUTE FUNCTION public.audit_credit_note_activity();

DROP TRIGGER IF EXISTS audit_credit_note_delete_trigger ON public.credit_notes;
CREATE TRIGGER audit_credit_note_delete_trigger
AFTER DELETE ON public.credit_notes
FOR EACH ROW
EXECUTE FUNCTION public.audit_credit_note_activity();

-- ---------------------------------------------------------------------------
-- 5. Sale returns
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.audit_sale_return_activity()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_action text;
  v_id uuid;
  v_org uuid;
BEGIN
  IF auth.uid() IS NULL THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF TG_OP = 'INSERT' THEN
    v_action := 'SALE_RETURN_CREATED';
  ELSIF TG_OP = 'DELETE' THEN
    v_action := 'SALE_RETURN_DELETED';
  ELSIF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL THEN
    v_action := 'SALE_RETURN_DELETED';
  ELSIF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL THEN
    v_action := 'SALE_RETURN_RESTORED';
  ELSE
    v_action := 'SALE_RETURN_UPDATED';
  END IF;

  v_id := COALESCE(NEW.id, OLD.id);
  v_org := COALESCE(NEW.organization_id, OLD.organization_id);

  PERFORM public.log_audit_safe(
    v_action,
    'sale_return',
    v_id,
    CASE WHEN TG_OP = 'INSERT' THEN NULL ELSE jsonb_build_object(
      'return_number', OLD.return_number,
      'customer_name', OLD.customer_name,
      'return_date', OLD.return_date,
      'net_amount', OLD.net_amount,
      'refund_type', OLD.refund_type,
      'credit_status', OLD.credit_status,
      'original_sale_number', OLD.original_sale_number
    ) END,
    CASE WHEN TG_OP = 'DELETE' THEN NULL ELSE jsonb_build_object(
      'return_number', NEW.return_number,
      'customer_name', NEW.customer_name,
      'return_date', NEW.return_date,
      'net_amount', NEW.net_amount,
      'refund_type', NEW.refund_type,
      'credit_status', NEW.credit_status,
      'original_sale_number', NEW.original_sale_number
    ) END,
    jsonb_build_object('table', 'sale_returns', 'organization_id', v_org)
  );

  RETURN COALESCE(NEW, OLD);
END;
$$;

REVOKE EXECUTE ON FUNCTION public.audit_sale_return_activity() FROM PUBLIC, anon;

DROP TRIGGER IF EXISTS audit_sale_return_insert_trigger ON public.sale_returns;
CREATE TRIGGER audit_sale_return_insert_trigger
AFTER INSERT ON public.sale_returns
FOR EACH ROW
EXECUTE FUNCTION public.audit_sale_return_activity();

DROP TRIGGER IF EXISTS audit_sale_return_update_trigger ON public.sale_returns;
CREATE TRIGGER audit_sale_return_update_trigger
AFTER UPDATE ON public.sale_returns
FOR EACH ROW
WHEN (
  OLD.net_amount      IS DISTINCT FROM NEW.net_amount
  OR OLD.deleted_at   IS DISTINCT FROM NEW.deleted_at
  OR OLD.refund_type  IS DISTINCT FROM NEW.refund_type
  OR OLD.credit_status IS DISTINCT FROM NEW.credit_status
  OR OLD.customer_id  IS DISTINCT FROM NEW.customer_id
  OR OLD.return_date  IS DISTINCT FROM NEW.return_date
)
EXECUTE FUNCTION public.audit_sale_return_activity();

DROP TRIGGER IF EXISTS audit_sale_return_delete_trigger ON public.sale_returns;
CREATE TRIGGER audit_sale_return_delete_trigger
AFTER DELETE ON public.sale_returns
FOR EACH ROW
EXECUTE FUNCTION public.audit_sale_return_activity();
