-- Customer Payment receipts (reference_type = customer) did not update sales.payment_status.
-- Extend receipt sync so invoice rows match ledger after Accounts → Customer Payment.

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
  v_tender numeric;
  v_row public.voucher_entries%ROWTYPE;
  v_desc text;
  v_cust_id uuid;
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

    SELECT s.organization_id, s.net_amount, COALESCE(s.sale_return_adjust, 0),
           COALESCE(s.is_cancelled, false), COALESCE(s.payment_status, ''), s.deleted_at,
           COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
      INTO v_org_id, v_net, v_sra, v_cancelled, v_status, v_deleted, v_tender
    FROM public.sales s
    WHERE s.id = v_sale_id;

    IF FOUND AND v_deleted IS NULL AND NOT v_cancelled AND v_status NOT IN ('cancelled', 'hold') THEN
      SELECT COALESCE(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 0)
        INTO v_receipt_total
      FROM public.voucher_entries ve
      WHERE ve.reference_id = v_sale_id
        AND ve.voucher_type = 'receipt'
        AND ve.reference_type IN ('sale', 'customer')
        AND ve.organization_id = v_org_id
        AND ve.deleted_at IS NULL;

      v_payable_cap := GREATEST(0, COALESCE(v_net, 0) - v_sra);

      IF COALESCE(v_tender, 0) > COALESCE(v_receipt_total, 0) + 0.0001 THEN
        v_new_paid := LEAST(v_payable_cap, GREATEST(COALESCE(v_receipt_total, 0), v_tender));
      ELSE
        v_new_paid := LEAST(v_payable_cap, v_receipt_total);
      END IF;

      IF (v_new_paid + v_sra) >= (COALESCE(v_net, 0) - 1) AND v_new_paid > 0 THEN
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
          ABS(COALESCE(paid_amount, 0) - v_new_paid) > 0.009
          OR COALESCE(payment_status, '') <> v_new_status
        );
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
      SELECT s.net_amount, COALESCE(s.sale_return_adjust, 0),
             COALESCE(s.cash_amount, 0) + COALESCE(s.card_amount, 0) + COALESCE(s.upi_amount, 0)
        INTO v_net, v_sra, v_tender
      FROM public.sales s
      WHERE s.id = v_sale_id;

      SELECT COALESCE(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 0)
        INTO v_receipt_total
      FROM public.voucher_entries ve
      WHERE ve.organization_id = v_org_id
        AND ve.voucher_type = 'receipt'
        AND ve.deleted_at IS NULL
        AND (
          (ve.reference_type = 'sale' AND ve.reference_id = v_sale_id)
          OR (
            ve.reference_type = 'customer'
            AND (
              ve.reference_id = v_sale_id
              OR (
                ve.reference_id = v_cust_id
                AND POSITION(UPPER((SELECT sale_number FROM public.sales WHERE id = v_sale_id)) IN UPPER(COALESCE(ve.description, ''))) > 0
              )
            )
          )
        );

      v_payable_cap := GREATEST(0, COALESCE(v_net, 0) - v_sra);

      IF COALESCE(v_tender, 0) > COALESCE(v_receipt_total, 0) + 0.0001 THEN
        v_new_paid := LEAST(v_payable_cap, GREATEST(COALESCE(v_receipt_total, 0), v_tender));
      ELSE
        v_new_paid := LEAST(v_payable_cap, v_receipt_total);
      END IF;

      IF (v_new_paid + v_sra) >= (COALESCE(v_net, 0) - 1) AND v_new_paid > 0 THEN
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
          ABS(COALESCE(paid_amount, 0) - v_new_paid) > 0.009
          OR COALESCE(payment_status, '') <> v_new_status
        );
    END LOOP;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;
