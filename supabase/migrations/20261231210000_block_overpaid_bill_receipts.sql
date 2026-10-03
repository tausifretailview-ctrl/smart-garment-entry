-- Block a receipt that would make a bill paid more than its amount.
--
-- Gurukrupa SARASWATI JI: RCP/25-26/180 (₹4,100) was recorded on POS/25-26/667, which was
-- already paid ₹4,100 at the counter, and RCP/26-27/1090 (₹500) overpaid POS/26-27/718. The
-- extra money had never been received, but every balance screen counted it.
--
-- Same rule as compute_sale_settlement (20261231205000):
--   effective paid = all receipts + counter tender not already a same-day receipt, the tender
--                    counted only as far as POS booked it as paid (sales.paid_amount). Stale
--                    tender on a pay-later bill (paid_amount 0) does not block the real payment.
--   due            = net − sale_return_adjust (only when SRA is not already inside net:
--                    items_gross gate, as in reconcile_customer_balance)
-- A write that leaves effective paid > due + ₹1 is rejected. Extra money belongs in an
-- Advance, not a bill receipt.
--
-- Scope: only app users (auth.role() = 'authenticated'). SQL editor, migrations, pg_cron and
-- service-role edge functions are not blocked, so backfills keep working. Memo receipts
-- (advance / credit-note applications) have their own guards and are skipped. Deleting a
-- receipt is never blocked. Existing overpaid bills are untouched until someone edits them —
-- find them with scripts/find-overpaid-bill-receipts.sql.

CREATE OR REPLACE FUNCTION public.guard_receipt_not_over_bill()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale record;
  v_gross numeric;
  v_sra numeric;
  v_due numeric;
  v_tender numeric;
  v_cur_paid numeric;
  v_other numeric;
  v_other_same_day numeric;
  v_new numeric;
  v_new_same_day boolean;
  v_paid_after numeric;
  v_paid_before numeric;
BEGIN
  IF COALESCE(auth.role(), '') <> 'authenticated' THEN
    RETURN NEW;
  END IF;
  IF NEW.deleted_at IS NOT NULL
     OR lower(COALESCE(NEW.voucher_type, '')) <> 'receipt'
     OR NEW.reference_id IS NULL
     OR public._is_settlement_memo_receipt(NEW.payment_method, NEW.description) THEN
    RETURN NEW;
  END IF;

  SELECT s.id, s.sale_number, s.net_amount, s.sale_date,
         COALESCE(s.sale_return_adjust, 0) AS sra,
         GREATEST(COALESCE(s.paid_amount, 0), 0) AS paid,
         GREATEST(COALESCE(s.cash_amount, 0), 0) + GREATEST(COALESCE(s.card_amount, 0), 0)
           + GREATEST(COALESCE(s.upi_amount, 0), 0) AS tender
    INTO v_sale
  FROM public.sales s
  WHERE s.id = NEW.reference_id
    AND s.organization_id = NEW.organization_id
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');
  IF NOT FOUND THEN
    RETURN NEW;  -- not a live bill (customer-keyed / opening-balance receipt)
  END IF;

  SELECT COALESCE(SUM(COALESCE(si.quantity, 0) * COALESCE(si.mrp, 0)), 0)
    INTO v_gross
  FROM public.sale_items si
  WHERE si.sale_id = v_sale.id AND si.deleted_at IS NULL;

  v_sra := CASE WHEN v_gross > 0 AND v_sale.sra > 0 AND v_sale.net_amount + v_sale.sra <= v_gross + 1
                THEN 0 ELSE v_sale.sra END;
  v_due := COALESCE(v_sale.net_amount, 0) - v_sra;
  v_tender := v_sale.tender;
  v_cur_paid := v_sale.paid;

  SELECT COALESCE(SUM(COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)), 0),
         COALESCE(SUM(CASE WHEN public._is_sale_day_receipt(ve.voucher_date, v_sale.sale_date)
                           THEN COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
                           ELSE 0 END), 0)
    INTO v_other, v_other_same_day
  FROM public.voucher_entries ve
  WHERE ve.reference_id = v_sale.id
    AND ve.organization_id = NEW.organization_id
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.deleted_at IS NULL
    AND ve.id IS DISTINCT FROM NEW.id
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description);

  v_new := COALESCE(NEW.total_amount, 0) + COALESCE(NEW.discount_amount, 0);
  v_new_same_day := public._is_sale_day_receipt(NEW.voucher_date, v_sale.sale_date);

  v_paid_before := v_other + LEAST(GREATEST(0, v_tender - v_other_same_day), v_cur_paid);
  v_paid_after := v_other + v_new
    + LEAST(GREATEST(0, v_tender - v_other_same_day - CASE WHEN v_new_same_day THEN v_new ELSE 0 END), v_cur_paid);

  -- Only block writes that push the bill over (or further over) its amount.
  IF v_paid_after > v_due + 1 AND v_paid_after > v_paid_before + 0.005 THEN
    RAISE EXCEPTION
      'Receipt ₹% is more than the ₹% still due on bill %. Record the extra amount as an Advance.',
      round(v_new), round(GREATEST(0, v_due - v_paid_before)), v_sale.sale_number
      USING ERRCODE = 'P0001', HINT = 'overpaid_bill_receipt';
  END IF;

  RETURN NEW;
END;
$$;
COMMENT ON FUNCTION public.guard_receipt_not_over_bill() IS
  'BEFORE INSERT/UPDATE on voucher_entries: app users cannot record a bill receipt that makes '
  'counter tender + receipts exceed the bill (same rule as compute_sale_settlement).';
REVOKE ALL ON FUNCTION public.guard_receipt_not_over_bill() FROM PUBLIC, anon, authenticated;

DROP TRIGGER IF EXISTS trg_guard_receipt_not_over_bill ON public.voucher_entries;
CREATE TRIGGER trg_guard_receipt_not_over_bill
  BEFORE INSERT OR UPDATE OF total_amount, discount_amount, reference_id, reference_type,
    voucher_date, voucher_type, deleted_at, payment_method
  ON public.voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.guard_receipt_not_over_bill();
