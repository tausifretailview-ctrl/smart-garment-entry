-- Count rows still needing historical GL backfill (Accounts → Accounting migration card).

CREATE OR REPLACE FUNCTION public.get_pending_gl_backfill_counts(p_org_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending_sales int;
  v_pending_purchases int;
  v_pending_sale_returns int;
  v_pending_purchase_returns int;
  v_failed_sales int;
  v_failed_purchases int;
  v_vouchers_without_journal int;
  v_engine_on boolean;
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF NOT EXISTS (
      SELECT 1
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
        AND om.organization_id = p_org_id
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.role = 'platform_admin'
    ) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  SELECT COUNT(*)::int INTO v_pending_sales
  FROM public.sales s
  WHERE s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND s.is_cancelled = false
    AND s.journal_status = 'pending'
    AND COALESCE(s.net_amount, 0) > 0;

  SELECT COUNT(*)::int INTO v_pending_purchases
  FROM public.purchase_bills pb
  WHERE pb.organization_id = p_org_id
    AND pb.deleted_at IS NULL
    AND COALESCE(pb.is_cancelled, false) = false
    AND pb.journal_status = 'pending'
    AND COALESCE(pb.net_amount, 0) > 0;

  SELECT COUNT(*)::int INTO v_pending_sale_returns
  FROM public.sale_returns sr
  WHERE sr.organization_id = p_org_id
    AND sr.deleted_at IS NULL
    AND sr.journal_status = 'pending'
    AND COALESCE(sr.net_amount, 0) > 0
    AND COALESCE(sr.refund_type, '') NOT IN ('exchange');

  SELECT COUNT(*)::int INTO v_pending_purchase_returns
  FROM public.purchase_returns pr
  WHERE pr.organization_id = p_org_id
    AND pr.deleted_at IS NULL
    AND pr.journal_status = 'pending'
    AND COALESCE(pr.net_amount, 0) > 0;

  SELECT COUNT(*)::int INTO v_failed_sales
  FROM public.sales s
  WHERE s.organization_id = p_org_id
    AND s.deleted_at IS NULL
    AND s.journal_status = 'failed';

  SELECT COUNT(*)::int INTO v_failed_purchases
  FROM public.purchase_bills pb
  WHERE pb.organization_id = p_org_id
    AND pb.deleted_at IS NULL
    AND pb.journal_status = 'failed';

  SELECT COUNT(*)::int INTO v_vouchers_without_journal
  FROM public.voucher_entries v
  WHERE v.organization_id = p_org_id
    AND v.deleted_at IS NULL
    AND COALESCE(v.total_amount, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.journal_entries je
      WHERE je.organization_id = p_org_id
        AND je.reference_id = v.id
        AND je.reference_type IN (
          'CustomerReceipt',
          'SupplierPayment',
          'ExpenseVoucher',
          'SalaryVoucher',
          'StudentFeeReceipt',
          'CustomerCreditNoteApplication',
          'CustomerAdvanceApplication',
          'Payment'
        )
    );

  SELECT COALESCE(s.accounting_engine_enabled, true)
  INTO v_engine_on
  FROM public.settings s
  WHERE s.organization_id = p_org_id;

  RETURN jsonb_build_object(
    'pending_sales', v_pending_sales,
    'pending_purchases', v_pending_purchases,
    'pending_sale_returns', v_pending_sale_returns,
    'pending_purchase_returns', v_pending_purchase_returns,
    'failed_sales', v_failed_sales,
    'failed_purchases', v_failed_purchases,
    'vouchers_without_journal', v_vouchers_without_journal,
    'total_pending',
      v_pending_sales
      + v_pending_purchases
      + v_pending_sale_returns
      + v_pending_purchase_returns
      + v_vouchers_without_journal,
    'total_failed', v_failed_sales + v_failed_purchases,
    'accounting_engine_enabled', v_engine_on
  );
END;
$$;

COMMENT ON FUNCTION public.get_pending_gl_backfill_counts(uuid) IS
  'Returns counts of sales/purchases/returns/vouchers awaiting GL journal post for historical backfill UI.';

GRANT EXECUTE ON FUNCTION public.get_pending_gl_backfill_counts(uuid) TO authenticated;
