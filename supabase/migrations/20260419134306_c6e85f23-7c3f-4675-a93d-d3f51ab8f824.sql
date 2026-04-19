
-- ==========================================================================
-- 1 & 2: Replace unguarded audit triggers with column-scoped versions
-- ==========================================================================

DROP TRIGGER IF EXISTS audit_sales_trigger ON public.sales;
DROP TRIGGER IF EXISTS audit_purchase_trigger ON public.purchase_bills;

-- Sales: WHEN guard on audit-worthy columns that actually exist on the table
CREATE TRIGGER audit_sales_trigger
AFTER UPDATE ON public.sales
FOR EACH ROW
WHEN (
  OLD.net_amount         IS DISTINCT FROM NEW.net_amount
  OR OLD.gross_amount    IS DISTINCT FROM NEW.gross_amount
  OR OLD.discount_amount IS DISTINCT FROM NEW.discount_amount
  OR OLD.other_charges   IS DISTINCT FROM NEW.other_charges
  OR OLD.round_off       IS DISTINCT FROM NEW.round_off
  OR OLD.customer_id     IS DISTINCT FROM NEW.customer_id
  OR OLD.customer_name   IS DISTINCT FROM NEW.customer_name
  OR OLD.sale_date       IS DISTINCT FROM NEW.sale_date
  OR OLD.payment_status  IS DISTINCT FROM NEW.payment_status
  OR OLD.sale_type       IS DISTINCT FROM NEW.sale_type
  OR OLD.deleted_at      IS DISTINCT FROM NEW.deleted_at
  OR OLD.is_cancelled    IS DISTINCT FROM NEW.is_cancelled
)
EXECUTE FUNCTION public.audit_sales_changes();

-- Purchase bills: WHEN guard on audit-worthy columns that actually exist
CREATE TRIGGER audit_purchase_trigger
AFTER UPDATE ON public.purchase_bills
FOR EACH ROW
WHEN (
  OLD.net_amount             IS DISTINCT FROM NEW.net_amount
  OR OLD.gross_amount        IS DISTINCT FROM NEW.gross_amount
  OR OLD.discount_amount     IS DISTINCT FROM NEW.discount_amount
  OR OLD.gst_amount          IS DISTINCT FROM NEW.gst_amount
  OR OLD.other_charges       IS DISTINCT FROM NEW.other_charges
  OR OLD.round_off           IS DISTINCT FROM NEW.round_off
  OR OLD.supplier_id         IS DISTINCT FROM NEW.supplier_id
  OR OLD.supplier_name       IS DISTINCT FROM NEW.supplier_name
  OR OLD.supplier_invoice_no IS DISTINCT FROM NEW.supplier_invoice_no
  OR OLD.bill_date           IS DISTINCT FROM NEW.bill_date
  OR OLD.deleted_at          IS DISTINCT FROM NEW.deleted_at
  OR OLD.is_locked           IS DISTINCT FROM NEW.is_locked
  OR OLD.is_dc_purchase      IS DISTINCT FROM NEW.is_dc_purchase
)
EXECUTE FUNCTION public.audit_purchase_changes();

-- ==========================================================================
-- 3: Composite indexes on return_items tables (cannot use CONCURRENTLY in tx)
-- ==========================================================================

CREATE INDEX IF NOT EXISTS idx_sale_return_items_org_return
  ON public.sale_return_items (return_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_org_return
  ON public.purchase_return_items (return_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_return_items_variant
  ON public.sale_return_items (variant_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_purchase_return_items_sku
  ON public.purchase_return_items (sku_id)
  WHERE deleted_at IS NULL;

-- ==========================================================================
-- 4: audit_logs retention purge function (90-day) with 50k safety threshold
-- ==========================================================================

CREATE OR REPLACE FUNCTION public.purge_old_audit_logs()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_candidate_count bigint;
  v_deleted_count bigint;
  v_cutoff timestamptz := now() - interval '90 days';
BEGIN
  SELECT count(*) INTO v_candidate_count
  FROM public.audit_logs
  WHERE created_at < v_cutoff;

  IF v_candidate_count > 50000 THEN
    INSERT INTO public.app_error_logs (operation, error_message, user_id, additional_context)
    VALUES (
      'audit_log_purge_blocked',
      format('Refused to purge %s audit rows in single run (threshold: 50000). Investigate before re-running.', v_candidate_count),
      NULL,
      jsonb_build_object('candidate_count', v_candidate_count, 'cutoff', v_cutoff)
    );
    RETURN jsonb_build_object('deleted', 0, 'blocked', true, 'candidate_count', v_candidate_count);
  END IF;

  DELETE FROM public.audit_logs WHERE created_at < v_cutoff;
  GET DIAGNOSTICS v_deleted_count = ROW_COUNT;

  RETURN jsonb_build_object('deleted', v_deleted_count, 'blocked', false);
END;
$$;

-- Schedule daily purge via pg_cron if extension is installed
DO $outer$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_extension WHERE extname = 'pg_cron') THEN
    BEGIN
      PERFORM cron.unschedule('purge-audit-logs');
    EXCEPTION WHEN OTHERS THEN
      NULL;
    END;
    PERFORM cron.schedule(
      'purge-audit-logs',
      '15 3 * * *',
      $cron$ SELECT public.purge_old_audit_logs(); $cron$
    );
  END IF;
END $outer$;
