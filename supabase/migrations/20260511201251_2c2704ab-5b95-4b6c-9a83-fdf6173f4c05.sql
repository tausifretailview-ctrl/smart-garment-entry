-- =====================================================================
-- Phase 3: Customer-ledger write-side hardening
-- =====================================================================

-- 1) Normalization trigger: reference_type='customer' but reference_id
--    matches a real sale -> auto-correct to 'sale'.
CREATE OR REPLACE FUNCTION public.trg_normalize_voucher_reference_type()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.reference_type = 'customer' AND NEW.reference_id IS NOT NULL THEN
    IF EXISTS (SELECT 1 FROM public.sales WHERE id = NEW.reference_id) THEN
      NEW.reference_type := 'sale';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS normalize_voucher_reference_type ON public.voucher_entries;
CREATE TRIGGER normalize_voucher_reference_type
BEFORE INSERT OR UPDATE OF reference_type, reference_id
ON public.voucher_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_normalize_voucher_reference_type();

-- 2) Helper: recompute customer_advances.used_amount per-customer (FIFO).
CREATE OR REPLACE FUNCTION public.recompute_customer_advances_used(
  p_organization_id uuid,
  p_customer_id uuid
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_used numeric := 0;
  v_remaining  numeric;
  rec          RECORD;
  v_use        numeric;
BEGIN
  IF p_organization_id IS NULL OR p_customer_id IS NULL THEN
    RETURN;
  END IF;

  -- Sum of advance-funded receipts for this customer:
  -- 1) sale-linked receipts where the linked sale belongs to this customer
  -- 2) opening-balance/advance receipts directly keyed to this customer
  SELECT COALESCE(SUM(ve.total_amount), 0) INTO v_total_used
  FROM public.voucher_entries ve
  LEFT JOIN public.sales s ON s.id = ve.reference_id
  WHERE ve.organization_id = p_organization_id
    AND ve.voucher_type = 'receipt'
    AND ve.deleted_at IS NULL
    AND (
      ve.payment_method = 'advance_adjustment'
      OR ve.description ILIKE '%adjusted from advance balance%'
    )
    AND (
      s.customer_id = p_customer_id
      OR (s.id IS NULL AND ve.reference_type = 'customer' AND ve.reference_id = p_customer_id)
    );

  v_remaining := v_total_used;

  FOR rec IN
    SELECT id, COALESCE(amount, 0) AS amount
    FROM public.customer_advances
    WHERE organization_id = p_organization_id
      AND customer_id = p_customer_id
    ORDER BY advance_date ASC NULLS LAST, created_at ASC NULLS LAST, id ASC
  LOOP
    v_use := LEAST(GREATEST(v_remaining, 0), rec.amount);
    UPDATE public.customer_advances
       SET used_amount = v_use,
           status = CASE
             WHEN v_use >= rec.amount AND rec.amount > 0 THEN 'used'
             WHEN v_use > 0 THEN 'partially_used'
             ELSE 'active'
           END
     WHERE id = rec.id;
    v_remaining := v_remaining - v_use;
  END LOOP;
END;
$$;

-- 3) Trigger: keep customer_advances.used_amount in sync on voucher changes.
CREATE OR REPLACE FUNCTION public.trg_sync_customer_advances_used()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_customer_old uuid;
  v_customer_new uuid;
  v_org_old      uuid;
  v_org_new      uuid;
  v_is_adv_old   boolean := false;
  v_is_adv_new   boolean := false;
BEGIN
  IF TG_OP IN ('UPDATE','DELETE') THEN
    v_org_old := OLD.organization_id;
    v_is_adv_old := OLD.voucher_type = 'receipt' AND (
      OLD.payment_method = 'advance_adjustment'
      OR COALESCE(OLD.description,'') ILIKE '%adjusted from advance balance%'
    );
    IF v_is_adv_old THEN
      SELECT s.customer_id INTO v_customer_old FROM public.sales s WHERE s.id = OLD.reference_id;
      IF v_customer_old IS NULL AND OLD.reference_type = 'customer' THEN
        v_customer_old := OLD.reference_id;
      END IF;
    END IF;
  END IF;

  IF TG_OP IN ('INSERT','UPDATE') THEN
    v_org_new := NEW.organization_id;
    v_is_adv_new := NEW.voucher_type = 'receipt' AND (
      NEW.payment_method = 'advance_adjustment'
      OR COALESCE(NEW.description,'') ILIKE '%adjusted from advance balance%'
    );
    IF v_is_adv_new THEN
      SELECT s.customer_id INTO v_customer_new FROM public.sales s WHERE s.id = NEW.reference_id;
      IF v_customer_new IS NULL AND NEW.reference_type = 'customer' THEN
        v_customer_new := NEW.reference_id;
      END IF;
    END IF;
  END IF;

  IF v_customer_old IS NOT NULL THEN
    PERFORM public.recompute_customer_advances_used(v_org_old, v_customer_old);
  END IF;
  IF v_customer_new IS NOT NULL
     AND (v_customer_new IS DISTINCT FROM v_customer_old OR v_org_new IS DISTINCT FROM v_org_old) THEN
    PERFORM public.recompute_customer_advances_used(v_org_new, v_customer_new);
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS sync_customer_advances_used ON public.voucher_entries;
CREATE TRIGGER sync_customer_advances_used
AFTER INSERT OR UPDATE OR DELETE
ON public.voucher_entries
FOR EACH ROW
EXECUTE FUNCTION public.trg_sync_customer_advances_used();

-- 4) One-shot backfill: relabel mis-tagged historical rows.
--    Uses the new BEFORE trigger implicitly via the explicit UPDATE.
UPDATE public.voucher_entries ve
   SET reference_type = 'sale'
 WHERE ve.reference_type = 'customer'
   AND ve.reference_id IS NOT NULL
   AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = ve.reference_id);

-- 5) One-shot recompute of customer_advances.used_amount for every customer
--    that has at least one advance row.
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT organization_id, customer_id
    FROM public.customer_advances
    WHERE customer_id IS NOT NULL
      AND organization_id IS NOT NULL
  LOOP
    PERFORM public.recompute_customer_advances_used(r.organization_id, r.customer_id);
  END LOOP;
END $$;