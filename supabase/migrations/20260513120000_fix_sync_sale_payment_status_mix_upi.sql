-- Mix POS bills store tender in cash_amount/card_amount/upi_amount; paid_amount is also set at save.
-- Receipt-only sync could overwrite paid_amount with a lower receipt sum (UPI missing from receipts).
-- When payment_method = 'multiple' and tender sum exceeds receipt sum, trust tender up to payable cap.

CREATE OR REPLACE FUNCTION public.sync_sale_payment_status_from_receipts()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_id uuid;
  v_org_id uuid;
  v_net numeric;
  v_sra numeric;
  v_cancelled boolean;
  v_status text;
  v_deleted timestamptz;
  v_receipt_total numeric;
  v_payable_cap numeric;
  v_new_paid numeric;
  v_new_status text;
  v_method text;
  v_tender numeric;
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.voucher_type <> 'receipt' OR OLD.reference_type <> 'sale' OR OLD.reference_id IS NULL THEN
      RETURN OLD;
    END IF;
    v_sale_id := OLD.reference_id;
  ELSE
    IF NEW.voucher_type <> 'receipt' OR NEW.reference_type <> 'sale' OR NEW.reference_id IS NULL THEN
      IF TG_OP = 'UPDATE'
         AND OLD.voucher_type = 'receipt'
         AND OLD.reference_type = 'sale'
         AND OLD.reference_id IS NOT NULL THEN
        v_sale_id := OLD.reference_id;
      ELSE
        RETURN NEW;
      END IF;
    ELSE
      v_sale_id := NEW.reference_id;
    END IF;
  END IF;

  SELECT s.organization_id, s.net_amount, COALESCE(s.sale_return_adjust,0),
         COALESCE(s.is_cancelled,false), COALESCE(s.payment_status,''), s.deleted_at,
         COALESCE(s.payment_method,''),
         COALESCE(s.cash_amount,0) + COALESCE(s.card_amount,0) + COALESCE(s.upi_amount,0)
    INTO v_org_id, v_net, v_sra, v_cancelled, v_status, v_deleted, v_method, v_tender
  FROM public.sales s
  WHERE s.id = v_sale_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  IF v_deleted IS NOT NULL OR v_cancelled OR v_status IN ('cancelled','hold') THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  SELECT COALESCE(SUM(COALESCE(ve.total_amount,0) + COALESCE(ve.discount_amount,0)), 0)
    INTO v_receipt_total
  FROM public.voucher_entries ve
  WHERE ve.reference_id = v_sale_id
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type = 'sale'
    AND ve.organization_id = v_org_id;

  v_payable_cap := GREATEST(0, COALESCE(v_net,0) - v_sra);

  IF lower(trim(COALESCE(v_method,''))) = 'multiple'
     AND COALESCE(v_tender,0) > COALESCE(v_receipt_total,0) + 0.0001 THEN
    v_new_paid := LEAST(v_payable_cap, v_tender);
  ELSE
    v_new_paid := LEAST(v_payable_cap, v_receipt_total);
  END IF;

  IF (v_new_paid + v_sra) >= (COALESCE(v_net,0) - 1) AND v_new_paid > 0 THEN
    v_new_status := 'completed';
  ELSIF v_new_paid > 0 THEN
    v_new_status := 'partial';
  ELSE
    v_new_status := 'pending';
  END IF;

  UPDATE public.sales
  SET paid_amount = v_new_paid,
      payment_status = v_new_status
  WHERE id = v_sale_id
    AND organization_id = v_org_id
    AND (
      ABS(COALESCE(paid_amount,0) - v_new_paid) > 0.009
      OR COALESCE(payment_status,'') <> v_new_status
    );

  RETURN COALESCE(NEW, OLD);
END;
$$;
