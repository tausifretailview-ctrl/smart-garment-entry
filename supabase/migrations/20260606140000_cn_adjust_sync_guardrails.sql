-- CN adjustment drift guardrails: source_document_id on vouchers, trigger as sole
-- credit_notes.used_amount writer, refactor adjust_invoice_balance, nightly drift check.

-- =============================================================================
-- 1. Schema
-- =============================================================================
ALTER TABLE public.voucher_entries
  ADD COLUMN IF NOT EXISTS source_document_id UUID NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'voucher_entries_source_document_id_fkey'
  ) THEN
    ALTER TABLE public.voucher_entries
      ADD CONSTRAINT voucher_entries_source_document_id_fkey
      FOREIGN KEY (source_document_id) REFERENCES public.credit_notes(id)
      ON DELETE RESTRICT;
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_voucher_entries_cn_source_doc
  ON public.voucher_entries (organization_id, source_document_id)
  WHERE payment_method = 'credit_note_adjustment' AND deleted_at IS NULL;

ALTER TABLE public.credit_notes
  DROP CONSTRAINT IF EXISTS credit_notes_used_amount_bounds;

ALTER TABLE public.credit_notes
  ADD CONSTRAINT credit_notes_used_amount_bounds
  CHECK (
    COALESCE(used_amount, 0) >= 0
    AND COALESCE(used_amount, 0) <= COALESCE(credit_amount, 0) + 0.01
  ) NOT VALID;

ALTER TABLE public.voucher_entries
  DROP CONSTRAINT IF EXISTS voucher_entries_cn_adjust_requires_source;

ALTER TABLE public.voucher_entries
  ADD CONSTRAINT voucher_entries_cn_adjust_requires_source
  CHECK (
    payment_method IS DISTINCT FROM 'credit_note_adjustment'
    OR source_document_id IS NOT NULL
  ) NOT VALID;

-- =============================================================================
-- 2. Backfill source_document_id from invoice_adjustments (metadata only)
-- =============================================================================
UPDATE public.voucher_entries ve
   SET source_document_id = ia.source_document_id
  FROM public.invoice_adjustments ia
 WHERE ve.source_document_id IS NULL
   AND ve.voucher_type = 'receipt'
   AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
   AND ve.deleted_at IS NULL
   AND ia.adjustment_type = 'CREDIT_NOTE'
   AND ia.organization_id = ve.organization_id
   AND ia.invoice_id = ve.reference_id
   AND ABS(COALESCE(ia.amount_applied, 0) - COALESCE(ve.total_amount, 0)) <= 0.02;

-- =============================================================================
-- 3. Trigger: sole writer for credit_notes.used_amount on CN-adjust vouchers
-- =============================================================================
CREATE OR REPLACE FUNCTION public.trg_cn_adjust_sync_fn()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cn            RECORD;
  v_amount        NUMERIC;
  v_new_used      NUMERIC;
  v_credit_amount NUMERIC;
BEGIN
  IF TG_OP = 'INSERT' THEN
    IF NEW.voucher_type = 'receipt'
       AND LOWER(COALESCE(NEW.payment_method, '')) = 'credit_note_adjustment'
       AND NEW.deleted_at IS NULL THEN

      IF NEW.source_document_id IS NULL THEN
        RAISE EXCEPTION 'credit_note_adjustment voucher requires source_document_id (credit_notes.id)';
      END IF;

      v_amount := COALESCE(NEW.total_amount, 0);
      IF v_amount <= 0 THEN
        RAISE EXCEPTION 'credit_note_adjustment amount must be positive';
      END IF;

      SELECT id, credit_amount, used_amount, organization_id
        INTO v_cn
        FROM public.credit_notes
       WHERE id = NEW.source_document_id
         AND organization_id = NEW.organization_id
         AND deleted_at IS NULL
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Credit note % not found for organization', NEW.source_document_id;
      END IF;

      v_credit_amount := COALESCE(v_cn.credit_amount, 0);
      v_new_used := COALESCE(v_cn.used_amount, 0) + v_amount;

      IF v_new_used > v_credit_amount + 0.01 THEN
        RAISE EXCEPTION 'CN apply ₹% exceeds remaining ₹% on credit note %',
          v_amount,
          GREATEST(0, v_credit_amount - COALESCE(v_cn.used_amount, 0)),
          NEW.source_document_id;
      END IF;

      UPDATE public.credit_notes
         SET used_amount = v_new_used,
             status = CASE
                        WHEN (v_credit_amount - v_new_used) <= 0.01 THEN 'fully_used'
                        WHEN v_new_used > 0 THEN 'partially_used'
                        ELSE status
                      END,
             updated_at = NOW()
       WHERE id = NEW.source_document_id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF LOWER(COALESCE(OLD.payment_method, '')) = 'credit_note_adjustment'
       OR LOWER(COALESCE(NEW.payment_method, '')) = 'credit_note_adjustment' THEN
      IF NEW.payment_method IS DISTINCT FROM OLD.payment_method
         OR NEW.source_document_id IS DISTINCT FROM OLD.source_document_id
         OR NEW.total_amount IS DISTINCT FROM OLD.total_amount THEN
        RAISE EXCEPTION 'Cannot mutate credit_note_adjustment voucher fields; soft-delete and re-apply via adjust_invoice_balance';
      END IF;
    END IF;

    -- Soft-delete: release CN pool
    IF OLD.deleted_at IS NULL AND NEW.deleted_at IS NOT NULL
       AND OLD.voucher_type = 'receipt'
       AND LOWER(COALESCE(OLD.payment_method, '')) = 'credit_note_adjustment'
       AND OLD.source_document_id IS NOT NULL THEN

      v_amount := COALESCE(OLD.total_amount, 0);
      SELECT credit_amount, used_amount INTO v_credit_amount, v_new_used
        FROM public.credit_notes
       WHERE id = OLD.source_document_id
         AND organization_id = OLD.organization_id
       FOR UPDATE;

      IF FOUND THEN
        v_new_used := GREATEST(0, COALESCE(v_new_used, 0) - v_amount);
        UPDATE public.credit_notes
           SET used_amount = v_new_used,
               status = CASE
                          WHEN v_new_used <= 0.01 THEN 'active'
                          WHEN (v_credit_amount - v_new_used) <= 0.01 THEN 'fully_used'
                          ELSE 'partially_used'
                        END,
               updated_at = NOW()
         WHERE id = OLD.source_document_id;
      END IF;
    END IF;

    -- Restore from recycle bin: re-consume CN pool
    IF OLD.deleted_at IS NOT NULL AND NEW.deleted_at IS NULL
       AND NEW.voucher_type = 'receipt'
       AND LOWER(COALESCE(NEW.payment_method, '')) = 'credit_note_adjustment'
       AND NEW.source_document_id IS NOT NULL THEN

      v_amount := COALESCE(NEW.total_amount, 0);
      SELECT credit_amount, used_amount INTO v_credit_amount, v_new_used
        FROM public.credit_notes
       WHERE id = NEW.source_document_id
         AND organization_id = NEW.organization_id
         AND deleted_at IS NULL
       FOR UPDATE;

      IF NOT FOUND THEN
        RAISE EXCEPTION 'Cannot restore CN voucher: credit note missing';
      END IF;

      v_new_used := COALESCE(v_new_used, 0) + v_amount;
      IF v_new_used > v_credit_amount + 0.01 THEN
        RAISE EXCEPTION 'Cannot restore CN voucher: would exceed credit note balance';
      END IF;

      UPDATE public.credit_notes
         SET used_amount = v_new_used,
             status = CASE
                        WHEN (v_credit_amount - v_new_used) <= 0.01 THEN 'fully_used'
                        ELSE 'partially_used'
                      END,
             updated_at = NOW()
       WHERE id = NEW.source_document_id;
    END IF;

    RETURN NEW;
  END IF;

  IF TG_OP = 'DELETE' THEN
    IF OLD.voucher_type = 'receipt'
       AND LOWER(COALESCE(OLD.payment_method, '')) = 'credit_note_adjustment'
       AND OLD.deleted_at IS NULL
       AND OLD.source_document_id IS NOT NULL THEN

      v_amount := COALESCE(OLD.total_amount, 0);
      SELECT used_amount INTO v_new_used
        FROM public.credit_notes
       WHERE id = OLD.source_document_id
       FOR UPDATE;

      IF FOUND THEN
        v_new_used := GREATEST(0, COALESCE(v_new_used, 0) - v_amount);
        UPDATE public.credit_notes
           SET used_amount = v_new_used,
               updated_at = NOW()
         WHERE id = OLD.source_document_id;
      END IF;
    END IF;
    RETURN OLD;
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;

DROP TRIGGER IF EXISTS trg_cn_adjust_sync ON public.voucher_entries;
CREATE TRIGGER trg_cn_adjust_sync
  BEFORE INSERT OR UPDATE OR DELETE ON public.voucher_entries
  FOR EACH ROW
  EXECUTE FUNCTION public.trg_cn_adjust_sync_fn();

-- =============================================================================
-- 4. adjust_invoice_balance — trigger owns credit_notes.used_amount
-- =============================================================================
DROP FUNCTION IF EXISTS public.adjust_invoice_balance(uuid, uuid, text, uuid, numeric, uuid, text);

CREATE OR REPLACE FUNCTION public.adjust_invoice_balance(
    p_organization_id uuid,
    p_invoice_id uuid,
    p_adjustment_type text,
    p_source_document_id uuid,
    p_amount_applied numeric,
    p_adjusted_by uuid DEFAULT NULL,
    p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_net_amount         NUMERIC;
    v_paid_amount        NUMERIC;
    v_sale_return_adjust NUMERIC;
    v_current_status     TEXT;
    v_sale_number        TEXT;
    v_deleted_at         TIMESTAMPTZ;
    v_is_cancelled       BOOLEAN;
    v_invoice_balance    NUMERIC;
    v_amount             NUMERIC;
    v_new_sr_adjust      NUMERIC;
    v_new_status         TEXT;

    v_source_total_amount NUMERIC;
    v_source_used_amount  NUMERIC;
    v_source_balance      NUMERIC;
    v_used_before         NUMERIC;

    v_voucher_number   TEXT;
    v_voucher_entry_id UUID;
    v_payment_method   TEXT;
    v_description      TEXT;
    v_today            DATE := CURRENT_DATE;
BEGIN
    IF p_amount_applied IS NULL OR p_amount_applied <= 0 THEN
        RAISE EXCEPTION 'Amount applied must be positive';
    END IF;

    SELECT net_amount, paid_amount, sale_return_adjust, payment_status,
           sale_number, deleted_at, COALESCE(is_cancelled, false)
      INTO v_net_amount, v_paid_amount, v_sale_return_adjust, v_current_status,
           v_sale_number, v_deleted_at, v_is_cancelled
      FROM sales
     WHERE id = p_invoice_id AND organization_id = p_organization_id
     FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale/Invoice not found';
    END IF;

    IF v_deleted_at IS NOT NULL THEN
        RAISE EXCEPTION 'Cannot adjust a deleted invoice';
    END IF;
    IF v_is_cancelled THEN
        RAISE EXCEPTION 'Cannot adjust a cancelled invoice';
    END IF;
    IF v_current_status IN ('hold', 'cancelled') THEN
        RAISE EXCEPTION 'Cannot adjust invoice in status %', v_current_status;
    END IF;

    v_invoice_balance := COALESCE(v_net_amount, 0)
                       - COALESCE(v_paid_amount, 0)
                       - COALESCE(v_sale_return_adjust, 0);

    IF v_invoice_balance <= 0.01 THEN
        RAISE EXCEPTION 'Invoice has no outstanding balance to adjust';
    END IF;

    v_amount := LEAST(p_amount_applied, v_invoice_balance);

    IF p_adjustment_type = 'CREDIT_NOTE' THEN
        SELECT credit_amount, used_amount INTO v_source_total_amount, v_source_used_amount
          FROM credit_notes
         WHERE id = p_source_document_id AND organization_id = p_organization_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Credit Note not found';
        END IF;

        v_used_before := COALESCE(v_source_used_amount, 0);
        v_source_balance := COALESCE(v_source_total_amount, 0) - v_used_before;

        IF v_source_balance < v_amount - 0.001 THEN
            RAISE EXCEPTION 'Adjustment amount exceeds available credit note balance';
        END IF;

        v_payment_method := 'credit_note_adjustment';
        v_description    := 'Credit note adjusted (₹' || v_amount || ') against ' || COALESCE(v_sale_number, p_invoice_id::text);

    ELSIF p_adjustment_type = 'ADVANCE_PAYMENT' THEN
        SELECT amount, used_amount INTO v_source_total_amount, v_source_used_amount
          FROM customer_advances
         WHERE id = p_source_document_id AND organization_id = p_organization_id
         FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Advance Payment not found';
        END IF;

        v_source_balance := COALESCE(v_source_total_amount, 0) - COALESCE(v_source_used_amount, 0);

        IF v_source_balance < v_amount THEN
            RAISE EXCEPTION 'Adjustment amount exceeds available advance balance';
        END IF;

        UPDATE customer_advances
           SET used_amount = COALESCE(used_amount, 0) + v_amount,
               status = CASE
                          WHEN (COALESCE(amount, 0) - (COALESCE(used_amount, 0) + v_amount)) <= 0.01 THEN 'fully_used'
                          ELSE 'partially_used'
                        END,
               updated_at = NOW()
         WHERE id = p_source_document_id;

        v_payment_method := 'advance_adjustment';
        v_description    := 'Advance adjusted (₹' || v_amount || ') against ' || COALESCE(v_sale_number, p_invoice_id::text);
        v_used_before := NULL;
    ELSE
        RAISE EXCEPTION 'Unsupported adjustment type: %', p_adjustment_type;
    END IF;

    v_new_sr_adjust := COALESCE(v_sale_return_adjust, 0) + v_amount;

    IF (COALESCE(v_net_amount, 0) - (COALESCE(v_paid_amount, 0) + v_new_sr_adjust)) <= 0.01 THEN
        v_new_status := 'completed';
    ELSIF (COALESCE(v_paid_amount, 0) + v_new_sr_adjust) > 0 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'pending';
    END IF;

    UPDATE sales
       SET sale_return_adjust = v_new_sr_adjust,
           payment_status     = v_new_status,
           updated_at         = NOW()
     WHERE id = p_invoice_id;

    v_voucher_number := public.generate_voucher_number('receipt', v_today);

    INSERT INTO voucher_entries (
        organization_id, voucher_number, voucher_type, voucher_date,
        reference_type, reference_id, description, total_amount,
        payment_method, created_by, source_document_id
    ) VALUES (
        p_organization_id, v_voucher_number, 'receipt', v_today,
        'sale', p_invoice_id, v_description, v_amount,
        v_payment_method, p_adjusted_by,
        CASE WHEN p_adjustment_type = 'CREDIT_NOTE' THEN p_source_document_id ELSE NULL END
    )
    RETURNING id INTO v_voucher_entry_id;

    INSERT INTO invoice_adjustments (
        organization_id, invoice_id, adjustment_type, source_document_id,
        amount_applied, adjusted_by, notes
    ) VALUES (
        p_organization_id, p_invoice_id, p_adjustment_type, p_source_document_id,
        v_amount, p_adjusted_by, p_notes
    );

    IF p_adjustment_type = 'CREDIT_NOTE' THEN
        INSERT INTO audit_logs (
            organization_id, user_id, action, entity_type, entity_id,
            old_values, new_values, metadata
        ) VALUES (
            p_organization_id, p_adjusted_by, 'credit_note_apply', 'credit_note', p_source_document_id,
            jsonb_build_object('used_amount', v_used_before),
            jsonb_build_object('used_amount', v_used_before + v_amount),
            jsonb_build_object(
                'sale_id', p_invoice_id,
                'voucher_entry_id', v_voucher_entry_id,
                'amount_applied', v_amount
            )
        );
    END IF;

    RETURN jsonb_build_object(
        'success',            true,
        'voucher_entry_id',   v_voucher_entry_id,
        'voucher_number',     v_voucher_number,
        'amount_applied',     v_amount,
        'sale_return_adjust', v_new_sr_adjust,
        'payment_status',     v_new_status
    );
END;
$function$;

GRANT EXECUTE ON FUNCTION public.adjust_invoice_balance(uuid, uuid, text, uuid, numeric, uuid, text) TO authenticated;

-- =============================================================================
-- 5. apply_credit_note_to_sale — delegate to adjust_invoice_balance per CN (FIFO)
-- =============================================================================
CREATE OR REPLACE FUNCTION public.apply_credit_note_to_sale(
  p_customer_id     uuid,
  p_sale_id         uuid,
  p_apply_amount    numeric,
  p_organization_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_note           RECORD;
  v_remaining      NUMERIC;
  v_amount_from_note NUMERIC;
  v_applied_total  NUMERIC := 0;
  v_notes_used     TEXT[] := '{}';
  v_result         JSONB;
  v_voucher_number TEXT;
  v_last_voucher_id UUID;
BEGIN
  IF p_apply_amount IS NULL OR p_apply_amount <= 0 THEN
    RAISE EXCEPTION 'Apply amount must be positive';
  END IF;

  v_remaining := p_apply_amount;

  FOR v_note IN
    SELECT id, credit_note_number, credit_amount, used_amount
      FROM credit_notes
     WHERE customer_id = p_customer_id
       AND organization_id = p_organization_id
       AND status IN ('active', 'partially_used', 'fully_used')
       AND deleted_at IS NULL
       AND (COALESCE(credit_amount, 0) - COALESCE(used_amount, 0)) > 0.01
     ORDER BY created_at
     FOR UPDATE
  LOOP
    EXIT WHEN v_remaining <= 0.01;

    v_amount_from_note := LEAST(
      v_remaining,
      COALESCE(v_note.credit_amount, 0) - COALESCE(v_note.used_amount, 0)
    );
    IF v_amount_from_note <= 0.01 THEN
      CONTINUE;
    END IF;

    v_result := public.adjust_invoice_balance(
      p_organization_id,
      p_sale_id,
      'CREDIT_NOTE',
      v_note.id,
      v_amount_from_note,
      NULL,
      'apply_credit_note_to_sale FIFO'
    );

    v_applied_total := v_applied_total + COALESCE((v_result->>'amount_applied')::numeric, v_amount_from_note);
    v_remaining := v_remaining - v_amount_from_note;
    v_notes_used := array_append(v_notes_used, v_note.credit_note_number);
    v_voucher_number := v_result->>'voucher_number';
    v_last_voucher_id := (v_result->>'voucher_entry_id')::uuid;
  END LOOP;

  IF v_applied_total <= 0 THEN
    RAISE EXCEPTION 'No credit available for this customer';
  END IF;

  RETURN jsonb_build_object(
    'success',        true,
    'applied_amount', v_applied_total,
    'notes_used',     v_notes_used,
    'voucher_number', v_voucher_number,
    'voucher_entry_id', v_last_voucher_id
  );
END;
$$;

GRANT EXECUTE ON FUNCTION public.apply_credit_note_to_sale(uuid, uuid, numeric, uuid) TO authenticated;

-- =============================================================================
-- 6. Nightly CN drift alerts
-- =============================================================================
CREATE TABLE IF NOT EXISTS public.cn_drift_alerts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  check_date DATE NOT NULL DEFAULT CURRENT_DATE,
  voucher_cn_total NUMERIC NOT NULL DEFAULT 0,
  header_used_total NUMERIC NOT NULL DEFAULT 0,
  delta NUMERIC NOT NULL DEFAULT 0,
  severity TEXT NOT NULL DEFAULT 'critical' CHECK (severity IN ('ok', 'warning', 'critical')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_cn_drift_alerts_org_cust_date
  ON public.cn_drift_alerts (organization_id, customer_id, check_date);

CREATE INDEX IF NOT EXISTS idx_cn_drift_alerts_org_date
  ON public.cn_drift_alerts (organization_id, check_date DESC);

ALTER TABLE public.cn_drift_alerts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "org_members_cn_drift_alerts_select" ON public.cn_drift_alerts;
CREATE POLICY "org_members_cn_drift_alerts_select" ON public.cn_drift_alerts
  FOR SELECT
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

GRANT SELECT ON public.cn_drift_alerts TO authenticated;
GRANT ALL ON public.cn_drift_alerts TO service_role;

CREATE OR REPLACE FUNCTION public.run_nightly_cn_drift_check(
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org          RECORD;
  v_cust         RECORD;
  v_voucher_sum  NUMERIC;
  v_header_sum   NUMERIC;
  v_delta        NUMERIC;
  v_checked      INT := 0;
  v_alerted      INT := 0;
BEGIN
  FOR v_org IN
    SELECT id FROM public.organizations
    WHERE p_organization_id IS NULL OR id = p_organization_id
  LOOP
    FOR v_cust IN
      SELECT DISTINCT c.id AS customer_id
        FROM public.customers c
       WHERE c.organization_id = v_org.id
         AND c.deleted_at IS NULL
    LOOP
      v_checked := v_checked + 1;

      SELECT COALESCE(SUM(ve.total_amount), 0) INTO v_voucher_sum
        FROM public.voucher_entries ve
        LEFT JOIN public.sales s ON s.id = ve.reference_id AND ve.reference_type IN ('sale', 'SALE')
        LEFT JOIN public.credit_notes cn ON cn.id = ve.source_document_id
       WHERE ve.organization_id = v_org.id
         AND ve.voucher_type = 'receipt'
         AND LOWER(COALESCE(ve.payment_method, '')) = 'credit_note_adjustment'
         AND ve.deleted_at IS NULL
         AND (
           s.customer_id = v_cust.customer_id
           OR cn.customer_id = v_cust.customer_id
         );

      SELECT COALESCE(SUM(cn.used_amount), 0) INTO v_header_sum
        FROM public.credit_notes cn
       WHERE cn.organization_id = v_org.id
         AND cn.customer_id = v_cust.customer_id
         AND cn.deleted_at IS NULL;

      v_delta := ABS(COALESCE(v_voucher_sum, 0) - COALESCE(v_header_sum, 0));

      IF v_delta > 1 THEN
        INSERT INTO public.cn_drift_alerts (
          organization_id, customer_id, check_date,
          voucher_cn_total, header_used_total, delta, severity
        ) VALUES (
          v_org.id, v_cust.customer_id, CURRENT_DATE,
          v_voucher_sum, v_header_sum, v_delta, 'critical'
        )
        ON CONFLICT (organization_id, customer_id, check_date)
        DO UPDATE SET
          voucher_cn_total = EXCLUDED.voucher_cn_total,
          header_used_total = EXCLUDED.header_used_total,
          delta = EXCLUDED.delta,
          severity = EXCLUDED.severity,
          created_at = NOW();
        v_alerted := v_alerted + 1;
      ELSE
        DELETE FROM public.cn_drift_alerts
         WHERE organization_id = v_org.id
           AND customer_id = v_cust.customer_id
           AND check_date = CURRENT_DATE;
      END IF;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'customers_checked', v_checked,
    'alerts_raised', v_alerted,
    'check_date', CURRENT_DATE
  );
END;
$$;

COMMENT ON FUNCTION public.run_nightly_cn_drift_check(UUID) IS
  'Compares per-customer sum(credit_note_adjustment vouchers) vs sum(credit_notes.used_amount). Alerts when delta > ₹1.';

GRANT EXECUTE ON FUNCTION public.run_nightly_cn_drift_check(UUID) TO service_role;
GRANT EXECUTE ON FUNCTION public.run_nightly_cn_drift_check(UUID) TO authenticated;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.unschedule('nightly-cn-drift-check');
  END IF;
EXCEPTION WHEN OTHERS THEN NULL;
END;
$$;

DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    PERFORM cron.schedule(
      'nightly-cn-drift-check',
      '0 21 * * *',
      $$SELECT public.run_nightly_cn_drift_check(NULL);$$
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'pg_cron schedule nightly-cn-drift-check skipped: %', SQLERRM;
END;
$$;
