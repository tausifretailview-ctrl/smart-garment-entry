-- Block double-cancel (legacy rows with payment_status only) and sale returns on cancelled invoices.

CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_sale_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_number     TEXT;
  v_is_cancelled    BOOLEAN;
  v_payment_status  TEXT;
  v_deleted_at      TIMESTAMPTZ;
  v_sra             NUMERIC;
BEGIN
  SELECT sale_number, is_cancelled, payment_status, deleted_at, COALESCE(sale_return_adjust, 0)
  INTO   v_sale_number, v_is_cancelled, v_payment_status, v_deleted_at, v_sra
  FROM   sales
  WHERE  id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_is_cancelled OR lower(coalesce(v_payment_status, '')) = 'cancelled' THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is already cancelled');
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice has been deleted');
  END IF;

  IF v_sra > 0 THEN
    UPDATE sale_returns
    SET    credit_status            = 'pending',
           linked_sale_id           = NULL,
           credit_available_balance = net_amount
    WHERE  linked_sale_id = p_sale_id
      AND  credit_status IN ('adjusted', 'partially_adjusted')
      AND  deleted_at IS NULL;
  END IF;

  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  UPDATE sales SET
    is_cancelled       = true,
    cancelled_at       = NOW(),
    cancelled_by       = auth.uid(),
    cancelled_reason   = p_reason,
    payment_status     = 'cancelled',
    sale_return_adjust = 0,
    updated_at         = NOW()
  WHERE id = p_sale_id;

  UPDATE voucher_entries
  SET    reference_type = 'cancelled_invoice',
         updated_at     = NOW()
  WHERE  reference_id  = p_sale_id
    AND  voucher_type  = 'receipt';

  RETURN jsonb_build_object(
    'success',     true,
    'sale_number', v_sale_number,
    'message',     'Invoice ' || v_sale_number || ' cancelled. Stock and sale return credits restored.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;


CREATE OR REPLACE FUNCTION public.guard_sale_return_not_on_cancelled_invoice()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale RECORD;
BEGIN
  IF NEW.linked_sale_id IS NOT NULL THEN
    SELECT id, sale_number, is_cancelled, payment_status, deleted_at
    INTO v_sale
    FROM sales
    WHERE id = NEW.linked_sale_id;

    IF FOUND AND (
      v_sale.deleted_at IS NOT NULL
      OR v_sale.is_cancelled = true
      OR lower(coalesce(v_sale.payment_status, '')) = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'Cannot create sale return against cancelled invoice %', coalesce(v_sale.sale_number, NEW.linked_sale_id::text);
    END IF;
  END IF;

  IF NEW.original_sale_number IS NOT NULL AND length(trim(NEW.original_sale_number)) > 0 THEN
    SELECT id, sale_number, is_cancelled, payment_status, deleted_at
    INTO v_sale
    FROM sales
    WHERE organization_id = NEW.organization_id
      AND sale_number = trim(NEW.original_sale_number)
      AND deleted_at IS NULL
    ORDER BY created_at DESC
    LIMIT 1;

    IF FOUND AND (
      v_sale.is_cancelled = true
      OR lower(coalesce(v_sale.payment_status, '')) = 'cancelled'
    ) THEN
      RAISE EXCEPTION 'Cannot create sale return against cancelled invoice %', v_sale.sale_number;
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_guard_sale_return_cancelled_invoice ON public.sale_returns;

CREATE TRIGGER trg_guard_sale_return_cancelled_invoice
  BEFORE INSERT OR UPDATE OF linked_sale_id, original_sale_number, organization_id
  ON public.sale_returns
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_sale_return_not_on_cancelled_invoice();

COMMENT ON FUNCTION public.guard_sale_return_not_on_cancelled_invoice() IS
  'Prevents sale returns from referencing cancelled invoices (by linked_sale_id or original_sale_number).';
