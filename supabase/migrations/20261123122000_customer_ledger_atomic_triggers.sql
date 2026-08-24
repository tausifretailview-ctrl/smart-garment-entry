-- Write customer_ledger_entries in the same transaction as sales / receipts /
-- sale returns / customer payment vouchers. Failures abort the primary write.
-- Inserts are idempotent so a brief dual-write window cannot double-count.

CREATE OR REPLACE FUNCTION public.insert_customer_ledger_entry(
  p_organization_id uuid,
  p_customer_id uuid,
  p_voucher_type text,
  p_voucher_no text,
  p_particulars text,
  p_transaction_date date,
  p_debit numeric,
  p_credit numeric
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_debit numeric := round(coalesce(p_debit, 0)::numeric, 2);
  v_credit numeric := round(coalesce(p_credit, 0)::numeric, 2);
BEGIN
  IF p_organization_id IS NULL OR p_customer_id IS NULL THEN
    RETURN;
  END IF;
  IF v_debit = 0 AND v_credit = 0 THEN
    RETURN;
  END IF;

  IF EXISTS (
    SELECT 1
    FROM public.customer_ledger_entries e
    WHERE e.organization_id = p_organization_id
      AND e.customer_id = p_customer_id
      AND e.voucher_type = p_voucher_type
      AND e.voucher_no IS NOT DISTINCT FROM p_voucher_no
      AND coalesce(e.debit, 0) = v_debit
      AND coalesce(e.credit, 0) = v_credit
      AND e.transaction_date IS NOT DISTINCT FROM p_transaction_date
  ) THEN
    RETURN;
  END IF;

  INSERT INTO public.customer_ledger_entries (
    organization_id,
    customer_id,
    voucher_type,
    voucher_no,
    particulars,
    transaction_date,
    debit,
    credit,
    created_by
  )
  VALUES (
    p_organization_id,
    p_customer_id,
    p_voucher_type,
    p_voucher_no,
    p_particulars,
    p_transaction_date,
    v_debit,
    v_credit,
    auth.uid()
  );
END;
$$;

CREATE OR REPLACE FUNCTION public.resolve_ledger_customer_id(
  p_org uuid,
  p_reference_type text,
  p_reference_id uuid
)
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_id uuid;
  v_rt text := lower(coalesce(p_reference_type, ''));
BEGIN
  IF p_reference_id IS NULL THEN
    RETURN NULL;
  END IF;

  IF v_rt IN ('sale', 'invoice') THEN
    SELECT s.customer_id INTO v_id
    FROM public.sales s
    WHERE s.id = p_reference_id
      AND s.organization_id = p_org;
    RETURN v_id;
  END IF;

  IF v_rt = 'customer' THEN
    SELECT c.id INTO v_id
    FROM public.customers c
    WHERE c.id = p_reference_id
      AND c.organization_id = p_org;
    IF v_id IS NOT NULL THEN
      RETURN v_id;
    END IF;
    -- PaymentsDashboard historically stored sale.id with reference_type customer.
    SELECT s.customer_id INTO v_id
    FROM public.sales s
    WHERE s.id = p_reference_id
      AND s.organization_id = p_org;
    RETURN v_id;
  END IF;

  RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_ledger_for_sale()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_exchange boolean;
  v_sale_debit numeric;
  v_date date;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF NEW.deleted_at IS NOT NULL AND OLD.deleted_at IS NULL THEN
      RETURN NEW;
    END IF;
    -- Payment sync only updates paid_amount — do not rewrite the sale ledger.
    IF OLD.net_amount IS NOT DISTINCT FROM NEW.net_amount
      AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
      AND OLD.sale_number IS NOT DISTINCT FROM NEW.sale_number
      AND OLD.sale_date IS NOT DISTINCT FROM NEW.sale_date
      AND OLD.sale_return_adjust IS NOT DISTINCT FROM NEW.sale_return_adjust
      AND OLD.refund_amount IS NOT DISTINCT FROM NEW.refund_amount
    THEN
      RETURN NEW;
    END IF;

    DELETE FROM public.customer_ledger_entries e
    WHERE e.organization_id = NEW.organization_id
      AND e.voucher_no = NEW.sale_number
      AND e.voucher_type IN ('SALE', 'RECEIPT');
  END IF;

  v_is_exchange :=
    coalesce(NEW.sale_return_adjust, 0) > 0.005
    AND coalesce(NEW.refund_amount, 0) > 0.005
    AND coalesce(NEW.net_amount, 0) <= 0.005;

  v_sale_debit := CASE
    WHEN v_is_exchange THEN
      round(greatest(0, coalesce(NEW.net_amount, 0) + coalesce(NEW.sale_return_adjust, 0))::numeric, 2)
    ELSE
      round(coalesce(NEW.net_amount, 0)::numeric, 2)
  END;

  v_date := coalesce(NEW.sale_date::date, CURRENT_DATE);

  PERFORM public.insert_customer_ledger_entry(
    NEW.organization_id,
    NEW.customer_id,
    'SALE',
    NEW.sale_number,
    'Sales Invoice ' || NEW.sale_number,
    v_date,
    v_sale_debit,
    0
  );

  IF NOT v_is_exchange AND coalesce(NEW.paid_amount, 0) > 0 THEN
    PERFORM public.insert_customer_ledger_entry(
      NEW.organization_id,
      NEW.customer_id,
      'RECEIPT',
      NEW.sale_number,
      'Payment at Sale ' || NEW.sale_number,
      v_date,
      0,
      round(NEW.paid_amount::numeric, 2)
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_ledger_for_voucher()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer uuid;
  v_type text := lower(coalesce(NEW.voucher_type, ''));
  v_date date := coalesce(NEW.voucher_date, CURRENT_DATE);
  v_cash numeric := round(coalesce(NEW.total_amount, 0)::numeric, 2);
  v_disc numeric := round(coalesce(NEW.discount_amount, 0)::numeric, 2);
  v_sale_no text;
  v_particulars text;
  v_disc_part text;
BEGIN
  IF NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_customer := public.resolve_ledger_customer_id(
    NEW.organization_id,
    NEW.reference_type,
    NEW.reference_id
  );
  IF v_customer IS NULL THEN
    RETURN NEW;
  END IF;

  IF v_type = 'receipt' THEN
    IF NEW.reference_type IS NOT NULL AND lower(NEW.reference_type) IN ('sale', 'invoice') THEN
      SELECT s.sale_number INTO v_sale_no
      FROM public.sales s
      WHERE s.id = NEW.reference_id;
    END IF;

    IF coalesce(NEW.description, '') ILIKE '%opening balance%' THEN
      v_particulars := 'Opening Balance Receipt';
      v_disc_part := 'Opening Balance — settlement discount'
        || CASE WHEN NEW.discount_reason IS NOT NULL AND NEW.discount_reason <> ''
           THEN ' (' || NEW.discount_reason || ')' ELSE '' END;
    ELSIF v_sale_no IS NOT NULL THEN
      v_particulars := 'Receipt for ' || v_sale_no;
      v_disc_part := 'Settlement discount — ' || v_sale_no
        || CASE WHEN NEW.discount_reason IS NOT NULL AND NEW.discount_reason <> ''
           THEN ' (' || NEW.discount_reason || ')' ELSE '' END;
    ELSIF coalesce(NEW.description, '') ILIKE '%advance adjusted%' THEN
      v_particulars := coalesce(NEW.description, 'Advance adjusted');
      v_disc_part := NULL;
    ELSE
      v_particulars := 'Receipt';
      v_disc_part := 'Settlement discount'
        || CASE WHEN NEW.discount_reason IS NOT NULL AND NEW.discount_reason <> ''
           THEN ' (' || NEW.discount_reason || ')' ELSE '' END;
    END IF;

    PERFORM public.insert_customer_ledger_entry(
      NEW.organization_id, v_customer, 'RECEIPT', NEW.voucher_number,
      v_particulars, v_date, 0, v_cash
    );
    IF v_disc > 0 THEN
      PERFORM public.insert_customer_ledger_entry(
        NEW.organization_id, v_customer, 'RECEIPT', NEW.voucher_number,
        v_disc_part, v_date, 0, v_disc
      );
    END IF;
    RETURN NEW;
  END IF;

  IF v_type = 'payment' AND lower(coalesce(NEW.reference_type, '')) = 'customer' THEN
    PERFORM public.insert_customer_ledger_entry(
      NEW.organization_id,
      v_customer,
      'PAYMENT',
      NEW.voucher_number,
      coalesce(NEW.description, 'Payment'),
      v_date,
      v_cash,
      0
    );
  END IF;

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.sync_customer_ledger_for_sale_return()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_amount numeric;
  v_no text;
BEGIN
  IF NEW.customer_id IS NULL OR NEW.deleted_at IS NOT NULL THEN
    RETURN NEW;
  END IF;

  v_no := coalesce(NEW.return_number, NEW.id::text);
  -- Floating SR used gross; invoice SR used net. Prefer net when present.
  v_amount := round(
    CASE
      WHEN coalesce(NEW.net_amount, 0) > 0 THEN NEW.net_amount
      ELSE coalesce(NEW.gross_amount, 0)
    END::numeric,
    2
  );

  IF TG_OP = 'UPDATE' THEN
    IF OLD.net_amount IS NOT DISTINCT FROM NEW.net_amount
      AND OLD.gross_amount IS NOT DISTINCT FROM NEW.gross_amount
      AND OLD.customer_id IS NOT DISTINCT FROM NEW.customer_id
      AND OLD.return_number IS NOT DISTINCT FROM NEW.return_number
    THEN
      RETURN NEW;
    END IF;
    DELETE FROM public.customer_ledger_entries e
    WHERE e.organization_id = NEW.organization_id
      AND e.voucher_no = v_no
      AND e.voucher_type = 'SALE_RETURN';
  END IF;

  PERFORM public.insert_customer_ledger_entry(
    NEW.organization_id,
    NEW.customer_id,
    'SALE_RETURN',
    v_no,
    'Sale Return ' || v_no,
    coalesce(NEW.return_date::date, CURRENT_DATE),
    0,
    v_amount
  );

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sales_sync_customer_ledger ON public.sales;
CREATE TRIGGER trg_sales_sync_customer_ledger
  AFTER INSERT OR UPDATE ON public.sales
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_ledger_for_sale();

DROP TRIGGER IF EXISTS trg_voucher_entries_sync_customer_ledger ON public.voucher_entries;
CREATE TRIGGER trg_voucher_entries_sync_customer_ledger
  AFTER INSERT ON public.voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_ledger_for_voucher();

DROP TRIGGER IF EXISTS trg_sale_returns_sync_customer_ledger ON public.sale_returns;
CREATE TRIGGER trg_sale_returns_sync_customer_ledger
  AFTER INSERT OR UPDATE ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_customer_ledger_for_sale_return();
