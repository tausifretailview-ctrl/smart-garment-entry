-- 1. Backfill KS Footwear sales payment_status / paid_amount from receipts
WITH receipt_sums AS (
  SELECT
    ve.reference_id AS sale_id,
    SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)) AS receipt_total
  FROM public.voucher_entries ve
  WHERE ve.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND ve.voucher_type = 'receipt'
    AND ve.reference_type = 'sale'
    AND ve.reference_id IS NOT NULL
  GROUP BY ve.reference_id
),
recomputed AS (
  SELECT
    s.id,
    s.net_amount,
    s.paid_amount AS old_paid,
    s.payment_status AS old_status,
    GREATEST(0, COALESCE(s.net_amount,0) - COALESCE(s.sale_return_adjust,0)) AS payable_cap,
    LEAST(
      GREATEST(0, COALESCE(s.net_amount,0) - COALESCE(s.sale_return_adjust,0)),
      COALESCE(rs.receipt_total, 0)
    ) AS new_paid,
    COALESCE(s.sale_return_adjust, 0) AS sra
  FROM public.sales s
  LEFT JOIN receipt_sums rs ON rs.sale_id = s.id
  WHERE s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND COALESCE(s.payment_status, '') NOT IN ('cancelled', 'hold')
)
UPDATE public.sales s
SET
  paid_amount = r.new_paid,
  payment_status = CASE
    WHEN (r.new_paid + r.sra) >= (COALESCE(r.net_amount,0) - 1) THEN 'completed'
    WHEN r.new_paid > 0 THEN 'partial'
    ELSE 'pending'
  END
FROM recomputed r
WHERE s.id = r.id
  AND s.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
  AND (
    ABS(COALESCE(s.paid_amount, 0) - r.new_paid) > 0.009
    OR COALESCE(s.payment_status, '') <> CASE
      WHEN (r.new_paid + r.sra) >= (COALESCE(r.net_amount,0) - 1) THEN 'completed'
      WHEN r.new_paid > 0 THEN 'partial'
      ELSE 'pending'
    END
  );

-- 2. Safety-net trigger: keep sales.paid_amount/payment_status in sync with receipts going forward
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
BEGIN
  -- Determine the affected sale id from OLD/NEW
  IF TG_OP = 'DELETE' THEN
    IF OLD.voucher_type <> 'receipt' OR OLD.reference_type <> 'sale' OR OLD.reference_id IS NULL THEN
      RETURN OLD;
    END IF;
    v_sale_id := OLD.reference_id;
  ELSE
    IF NEW.voucher_type <> 'receipt' OR NEW.reference_type <> 'sale' OR NEW.reference_id IS NULL THEN
      -- If row was previously a sale-receipt and now isn't, still resync the old sale
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
         COALESCE(s.is_cancelled,false), COALESCE(s.payment_status,''), s.deleted_at
    INTO v_org_id, v_net, v_sra, v_cancelled, v_status, v_deleted
  FROM public.sales s
  WHERE s.id = v_sale_id;

  IF NOT FOUND THEN
    RETURN COALESCE(NEW, OLD);
  END IF;

  -- Don't touch cancelled / hold / soft-deleted sales
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
  v_new_paid := LEAST(v_payable_cap, v_receipt_total);

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

DROP TRIGGER IF EXISTS trg_sync_sale_payment_status_from_receipts ON public.voucher_entries;
CREATE TRIGGER trg_sync_sale_payment_status_from_receipts
AFTER INSERT OR UPDATE OR DELETE ON public.voucher_entries
FOR EACH ROW EXECUTE FUNCTION public.sync_sale_payment_status_from_receipts();