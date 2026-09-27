-- Credit-note safeguards on sales (POS/26-27/396 follow-up).
--
-- 1. Guard: an UPDATE may not lower sale_return_adjust below the credit-note
--    adjustment vouchers still live on the bill. The legitimate path
--    (release_sale_credit / cancel_invoice) soft-deletes those vouchers first,
--    so it passes. Any other save that drops the credit while the note stays
--    "used" is refused instead of double-counting it as cash/UPI.
--    Only a DROP is checked, so rows that already drifted can still be edited
--    for other fields. Applies to deleted/cancelled/held rows too.
--
-- 2. Audit: SALE_UPDATED now records sale_return_adjust, paid/cash/upi/card and
--    discount before/after, and the trigger fires when any of them change.
--
-- 3. find_sale_credit_mismatches(org): read-only list of bills whose
--    sale_return_adjust is below their live credit-note vouchers.

-- ---------------------------------------------------------------------------
-- 1. Guard
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.guard_sale_credit_not_dropped()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_live_cn numeric;
BEGIN
  -- No exemption for deleted / cancelled / hold rows: cancel and release
  -- soft-delete the vouchers first, and a status flip later would not re-run
  -- this guard (it fires on sale_return_adjust only).
  IF COALESCE(NEW.sale_return_adjust, 0) >= COALESCE(OLD.sale_return_adjust, 0) - 0.01 THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(SUM(ve.total_amount), 0)
    INTO v_live_cn
    FROM public.voucher_entries ve
   WHERE ve.reference_id = NEW.id
     AND ve.deleted_at IS NULL
     AND ve.payment_method = 'credit_note_adjustment';

  IF COALESCE(NEW.sale_return_adjust, 0) < v_live_cn - 0.01 THEN
    RAISE EXCEPTION
      'Bill % still uses ₹% of credit note. Release the credit note before removing it from the bill.',
      COALESCE(NEW.sale_number, NEW.id::text), round(v_live_cn, 2)
      USING ERRCODE = 'P0001',
            HINT = 'guard_sale_credit_not_dropped';
  END IF;

  RETURN NEW;
END;
$$;

COMMENT ON FUNCTION public.guard_sale_credit_not_dropped() IS
  'BEFORE UPDATE on sales: refuses lowering sale_return_adjust below live credit_note_adjustment vouchers (release_sale_credit deletes them first).';

DROP TRIGGER IF EXISTS trg_guard_sale_credit_not_dropped ON public.sales;
CREATE TRIGGER trg_guard_sale_credit_not_dropped
BEFORE UPDATE OF sale_return_adjust ON public.sales
FOR EACH ROW
WHEN (COALESCE(NEW.sale_return_adjust, 0) < COALESCE(OLD.sale_return_adjust, 0))
EXECUTE FUNCTION public.guard_sale_credit_not_dropped();

-- ---------------------------------------------------------------------------
-- 2. Audit: record settlement fields on SALE_UPDATED
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
      jsonb_build_object('table', 'sales')
    );
  ELSIF TG_OP = 'UPDATE' THEN
    PERFORM log_audit(
      'SALE_UPDATED',
      'sale',
      NEW.id,
      jsonb_build_object(
        'sale_number', OLD.sale_number,
        'net_amount', OLD.net_amount,
        'payment_status', OLD.payment_status,
        'discount_amount', OLD.discount_amount,
        'sale_return_adjust', OLD.sale_return_adjust,
        'paid_amount', OLD.paid_amount,
        'cash_amount', OLD.cash_amount,
        'upi_amount', OLD.upi_amount,
        'card_amount', OLD.card_amount,
        'payment_method', OLD.payment_method
      ),
      jsonb_build_object(
        'sale_number', NEW.sale_number,
        'net_amount', NEW.net_amount,
        'payment_status', NEW.payment_status,
        'discount_amount', NEW.discount_amount,
        'sale_return_adjust', NEW.sale_return_adjust,
        'paid_amount', NEW.paid_amount,
        'cash_amount', NEW.cash_amount,
        'upi_amount', NEW.upi_amount,
        'card_amount', NEW.card_amount,
        'payment_method', NEW.payment_method
      ),
      jsonb_build_object('table', 'sales')
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
      jsonb_build_object('table', 'sales', 'warning', 'Sale deletion affects stock')
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
  OLD.net_amount            IS DISTINCT FROM NEW.net_amount
  OR OLD.gross_amount       IS DISTINCT FROM NEW.gross_amount
  OR OLD.discount_amount    IS DISTINCT FROM NEW.discount_amount
  OR OLD.other_charges      IS DISTINCT FROM NEW.other_charges
  OR OLD.round_off          IS DISTINCT FROM NEW.round_off
  OR OLD.customer_id        IS DISTINCT FROM NEW.customer_id
  OR OLD.customer_name      IS DISTINCT FROM NEW.customer_name
  OR OLD.sale_date          IS DISTINCT FROM NEW.sale_date
  OR OLD.payment_status     IS DISTINCT FROM NEW.payment_status
  OR OLD.sale_type          IS DISTINCT FROM NEW.sale_type
  OR OLD.deleted_at         IS DISTINCT FROM NEW.deleted_at
  OR OLD.is_cancelled       IS DISTINCT FROM NEW.is_cancelled
  OR OLD.sale_return_adjust IS DISTINCT FROM NEW.sale_return_adjust
  OR OLD.paid_amount        IS DISTINCT FROM NEW.paid_amount
  OR OLD.cash_amount        IS DISTINCT FROM NEW.cash_amount
  OR OLD.upi_amount         IS DISTINCT FROM NEW.upi_amount
  OR OLD.card_amount        IS DISTINCT FROM NEW.card_amount
)
EXECUTE FUNCTION public.audit_sales_changes();

-- ---------------------------------------------------------------------------
-- 3. Mismatch report
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.find_sale_credit_mismatches(p_organization_id uuid)
RETURNS TABLE (
  sale_id uuid,
  sale_number text,
  customer_name text,
  sale_date date,
  net_amount numeric,
  sale_return_adjust numeric,
  paid_amount numeric,
  live_credit_note_adjust numeric,
  missing_credit numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  RETURN QUERY
  WITH cn AS (
    SELECT ve.reference_id, SUM(ve.total_amount) AS amt
      FROM public.voucher_entries ve
     WHERE ve.organization_id = p_organization_id
       AND ve.deleted_at IS NULL
       AND ve.payment_method = 'credit_note_adjustment'
     GROUP BY ve.reference_id
  )
  SELECT s.id, s.sale_number::text, s.customer_name::text, s.sale_date::date,
         s.net_amount::numeric, COALESCE(s.sale_return_adjust, 0)::numeric,
         COALESCE(s.paid_amount, 0)::numeric,
         round(cn.amt::numeric, 2), round((cn.amt - COALESCE(s.sale_return_adjust, 0))::numeric, 2)
    FROM public.sales s
    JOIN cn ON cn.reference_id = s.id
   WHERE s.organization_id = p_organization_id
     AND s.deleted_at IS NULL
     AND NOT COALESCE(s.is_cancelled, false)
     AND COALESCE(s.sale_return_adjust, 0) < cn.amt - 0.01
   ORDER BY s.sale_date DESC, s.sale_number;
END;
$$;

REVOKE ALL ON FUNCTION public.find_sale_credit_mismatches(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.find_sale_credit_mismatches(uuid) TO authenticated, service_role;
