-- Nightly reconciliation: only customers with recent activity (last 7 days).
-- Full scan of all customers on the 1st of each month.

CREATE OR REPLACE FUNCTION public.run_nightly_balance_reconciliation(
  p_organization_id UUID DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_org RECORD;
  v_cust RECORD;
  v_rpc_outstanding NUMERIC;
  v_invoice_outstanding NUMERIC;
  v_drift NUMERIC;
  v_severity TEXT;
  v_notes TEXT;
  v_total_checked INT := 0;
  v_total_warnings INT := 0;
  v_total_critical INT := 0;
  v_has_phantom BOOLEAN;
  v_has_mistagged BOOLEAN;
  v_has_overpaid BOOLEAN;
  v_has_sr_drift BOOLEAN;
  v_pending_sr NUMERIC;
  v_adv_used NUMERIC;
  v_voucher_adv NUMERIC;
  v_opening_balance NUMERIC;
  v_balance_adjustments NUMERIC;
  v_total_invoiced NUMERIC;
  v_sale_return_adjust NUMERIC;
  v_receipt_payments NUMERIC;
  v_credit_note_vouchers NUMERIC;
  v_customer_payment_refunds NUMERIC;
  v_advances_applied NUMERIC;
  v_unused_advances NUMERIC;
  v_full_month_scan BOOLEAN;
BEGIN
  PERFORM set_config('statement_timeout', '0', true);

  v_full_month_scan := EXTRACT(DAY FROM CURRENT_DATE) = 1;

  IF auth.uid() IS NOT NULL THEN
    IF p_organization_id IS NULL THEN
      IF NOT public.has_role(auth.uid(), 'platform_admin'::app_role) THEN
        RAISE EXCEPTION 'p_organization_id is required for manual reconciliation'
          USING ERRCODE = '42501';
      END IF;
    ELSIF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_organization_id
        AND om.role IN ('admin', 'manager')
    ) THEN
      RAISE EXCEPTION 'Not authorized to run reconciliation for this organization'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  FOR v_org IN
    SELECT o.id, o.name
    FROM public.organizations o
    WHERE (p_organization_id IS NULL OR o.id = p_organization_id)
  LOOP
    FOR v_cust IN
      SELECT c.id, c.customer_name
      FROM public.customers c
      WHERE c.organization_id = v_org.id
        AND c.deleted_at IS NULL
        AND (
          v_full_month_scan
          OR EXISTS (
            SELECT 1
            FROM public.sales s
            WHERE s.customer_id = c.id
              AND s.organization_id = v_org.id
              AND s.deleted_at IS NULL
              AND s.updated_at > NOW() - INTERVAL '7 days'
          )
          OR EXISTS (
            SELECT 1
            FROM public.voucher_entries ve
            INNER JOIN public.sales s ON s.id::text = ve.reference_id::text
            WHERE s.customer_id = c.id
              AND s.organization_id = v_org.id
              AND ve.organization_id = v_org.id
              AND ve.deleted_at IS NULL
              AND ve.created_at > NOW() - INTERVAL '7 days'
          )
          OR EXISTS (
            SELECT 1
            FROM public.customer_advances ca
            WHERE ca.customer_id = c.id
              AND ca.organization_id = v_org.id
              AND ca.updated_at > NOW() - INTERVAL '7 days'
          )
        )
    LOOP
      BEGIN
        v_total_checked := v_total_checked + 1;

        SELECT
          COALESCE(SUM(r.amount), 0),
          COALESCE(MAX(CASE WHEN r.source = 'opening_balance' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'balance_adjustment' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'total_invoiced' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'sale_return_adjust_on_invoices' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'receipt_payments' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'credit_note_vouchers' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'customer_payment_refunds' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'advances_applied' THEN r.amount END), 0),
          COALESCE(MAX(CASE WHEN r.source = 'unused_advances' THEN r.amount END), 0)
        INTO
          v_rpc_outstanding,
          v_opening_balance,
          v_balance_adjustments,
          v_total_invoiced,
          v_sale_return_adjust,
          v_receipt_payments,
          v_credit_note_vouchers,
          v_customer_payment_refunds,
          v_advances_applied,
          v_unused_advances
        FROM public.reconcile_customer_balance(v_cust.id, v_org.id) AS r;

        SELECT COALESCE(SUM(sr.net_amount), 0)
        INTO v_pending_sr
        FROM public.sale_returns sr
        WHERE sr.customer_id = v_cust.id
          AND sr.organization_id = v_org.id
          AND sr.deleted_at IS NULL
          AND lower(COALESCE(sr.credit_status, '')) = 'pending';

        SELECT COALESCE(SUM(
          GREATEST(
            0::numeric,
            COALESCE(s.net_amount, 0)
              - COALESCE(s.paid_amount, 0)
              - COALESCE(s.sale_return_adjust, 0)
          )
        ), 0)
        INTO v_invoice_outstanding
        FROM public.sales s
        WHERE s.customer_id = v_cust.id
          AND s.organization_id = v_org.id
          AND s.deleted_at IS NULL
          AND COALESCE(s.is_cancelled, FALSE) = FALSE
          AND lower(COALESCE(s.payment_status, '')) NOT IN ('cancelled', 'hold');

        v_drift := ABS(COALESCE(v_rpc_outstanding, 0) - COALESCE(v_invoice_outstanding, 0));

        SELECT COALESCE(SUM(ca.used_amount), 0)
        INTO v_adv_used
        FROM public.customer_advances ca
        WHERE ca.customer_id = v_cust.id
          AND ca.organization_id = v_org.id;

        SELECT COALESCE(SUM(ve.total_amount), 0)
        INTO v_voucher_adv
        FROM public.voucher_entries ve
        INNER JOIN public.sales s ON s.id::text = ve.reference_id::text
        WHERE s.customer_id = v_cust.id
          AND s.organization_id = v_org.id
          AND ve.organization_id = v_org.id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND lower(COALESCE(ve.payment_method, '')) = 'advance_adjustment';

        v_has_phantom := ABS(COALESCE(v_adv_used, 0) - COALESCE(v_voucher_adv, 0)) > 1;

        SELECT EXISTS (
          SELECT 1
          FROM public.voucher_entries ve
          WHERE ve.organization_id = v_org.id
            AND ve.deleted_at IS NULL
            AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
            AND lower(COALESCE(ve.reference_type, '')) = 'customer'
            AND EXISTS (
              SELECT 1
              FROM public.sales s
              WHERE s.id::text = ve.reference_id::text
                AND s.customer_id = v_cust.id
                AND s.organization_id = v_org.id
            )
        ) INTO v_has_mistagged;

        SELECT EXISTS (
          SELECT 1
          FROM public.sales s
          WHERE s.customer_id = v_cust.id
            AND s.organization_id = v_org.id
            AND s.deleted_at IS NULL
            AND COALESCE(s.paid_amount, 0) + COALESCE(s.sale_return_adjust, 0)
              > COALESCE(s.net_amount, 0) + 1
        ) INTO v_has_overpaid;

        v_has_sr_drift := FALSE;
        IF to_regclass('public.sr_invoice_integrity_check') IS NOT NULL THEN
          SELECT EXISTS (
            SELECT 1
            FROM public.sr_invoice_integrity_check sic
            WHERE sic.organization_id = v_org.id
              AND sic.customer_id = v_cust.id
              AND ABS(COALESCE(sic.drift_amount, 0)) > 0.01
          ) INTO v_has_sr_drift;
        END IF;

        v_severity := 'ok';
        IF v_has_phantom OR v_has_overpaid OR v_drift > 1000 THEN
          v_severity := 'critical';
          v_total_critical := v_total_critical + 1;
        ELSIF v_has_mistagged OR v_has_sr_drift OR v_drift > 1 THEN
          v_severity := 'warning';
          v_total_warnings := v_total_warnings + 1;
        END IF;

        v_notes := '';
        IF v_has_phantom THEN
          v_notes := v_notes || 'Phantom advance (voucher ₹' || ROUND(v_voucher_adv, 2)
            || ' vs used ₹' || ROUND(v_adv_used, 2) || '); ';
        END IF;
        IF v_has_mistagged THEN v_notes := v_notes || 'Mistagged receipts; '; END IF;
        IF v_has_overpaid THEN v_notes := v_notes || 'Overpaid invoices; '; END IF;
        IF v_has_sr_drift THEN v_notes := v_notes || 'SR-invoice drift; '; END IF;
        IF v_drift > 1 THEN
          v_notes := v_notes || 'RPC-vs-invoice drift ₹' || ROUND(v_drift, 2) || '; ';
        END IF;

        IF v_severity <> 'ok' THEN
          DELETE FROM public.balance_reconciliation_log
          WHERE organization_id = v_org.id
            AND customer_id = v_cust.id
            AND check_date = CURRENT_DATE;

          INSERT INTO public.balance_reconciliation_log (
            organization_id,
            customer_id,
            customer_name,
            check_date,
            rpc_outstanding,
            opening_balance,
            total_invoiced,
            total_sale_return_adjust,
            receipt_payments,
            credit_note_vouchers,
            customer_payment_refunds,
            advances_applied,
            unused_advances,
            pending_sale_returns,
            balance_adjustments,
            invoice_sum_outstanding,
            drift_rpc_vs_invoices,
            has_phantom_advance,
            has_mistagged_receipts,
            has_overpaid_invoices,
            has_sr_invoice_drift,
            severity,
            notes
          ) VALUES (
            v_org.id,
            v_cust.id,
            v_cust.customer_name,
            CURRENT_DATE,
            COALESCE(v_rpc_outstanding, 0),
            v_opening_balance,
            v_total_invoiced,
            v_sale_return_adjust,
            v_receipt_payments,
            v_credit_note_vouchers,
            v_customer_payment_refunds,
            v_advances_applied,
            v_unused_advances,
            COALESCE(v_pending_sr, 0),
            v_balance_adjustments,
            COALESCE(v_invoice_outstanding, 0),
            COALESCE(v_drift, 0),
            v_has_phantom,
            v_has_mistagged,
            v_has_overpaid,
            v_has_sr_drift,
            v_severity,
            NULLIF(TRIM(v_notes), '')
          );
        END IF;

      EXCEPTION WHEN OTHERS THEN
        DELETE FROM public.balance_reconciliation_log
        WHERE organization_id = v_org.id
          AND customer_id = v_cust.id
          AND check_date = CURRENT_DATE;

        INSERT INTO public.balance_reconciliation_log (
          organization_id,
          customer_id,
          customer_name,
          check_date,
          rpc_outstanding,
          severity,
          notes
        ) VALUES (
          v_org.id,
          v_cust.id,
          v_cust.customer_name,
          CURRENT_DATE,
          0,
          'critical',
          'Check failed: ' || SQLERRM
        );
        v_total_critical := v_total_critical + 1;
      END;
    END LOOP;
  END LOOP;

  RETURN jsonb_build_object(
    'checked', v_total_checked,
    'warnings', v_total_warnings,
    'critical', v_total_critical,
    'ok', GREATEST(0, v_total_checked - v_total_warnings - v_total_critical),
    'date', CURRENT_DATE::text,
    'full_month_scan', v_full_month_scan
  );
END;
$$;

COMMENT ON FUNCTION public.run_nightly_balance_reconciliation(UUID) IS
  'Nightly/manual customer balance reconciliation. Nightly runs only customers with activity in the last 7 days; on the 1st of each month all customers are checked.';
