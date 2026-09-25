-- FIX-3: Count POS exchange refund once — skip payment voucher when sales.refund_amount
-- already records the payout (Rule B bills). Legacy negative-net bills still use the voucher.
-- Patches in place; aborts if expected customer_payment_refunds shape is missing.

DO $mig$
DECLARE
  d text;
  old_tail text := E'      AND lower(COALESCE(ve.reference_type, '''')) = ''customer''\n    GROUP BY ve.reference_id::uuid';
  new_tail text := E'      AND lower(COALESCE(ve.reference_type, '''')) = ''customer''\n      AND NOT (\n        lower(COALESCE(ve.description, '''')) LIKE ''%refund paid for pos exchange%''\n        AND EXISTS (\n          SELECT 1\n          FROM public.sales s\n          WHERE s.organization_id = p_organization_id\n            AND s.deleted_at IS NULL\n            AND lower(trim(COALESCE(s.sale_number, ''''))) =\n                lower(trim(substring(COALESCE(ve.description, '''') from ''(?i)refund paid for pos exchange\\s+(.+)$'')))\n            AND COALESCE(s.refund_amount, 0) > 0.005\n        )\n      )\n    GROUP BY ve.reference_id::uuid';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_customer_financial_snapshot_all'
    AND pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid';

  IF d IS NULL THEN
    RAISE EXCEPTION 'get_customer_financial_snapshot_all not found';
  END IF;
  IF position('customer_payment_refunds AS (' IN d) = 0 THEN
    RAISE EXCEPTION 'CHECK-7: customer_payment_refunds CTE not found in snapshot; aborting';
  END IF;
  IF position(old_tail IN d) = 0 THEN
    RAISE EXCEPTION 'CHECK-7: expected customer_payment_refunds tail not found; aborting';
  END IF;

  d := replace(d, old_tail, new_tail);
  EXECUTE d;
END
$mig$;

DO $mig$
DECLARE
  d text;
  old_tail text := E'      AND lower(COALESCE(ve.reference_type, '''')) = ''customer''\n    GROUP BY ve.reference_id::uuid';
  new_tail text := E'      AND lower(COALESCE(ve.reference_type, '''')) = ''customer''\n      AND NOT (\n        lower(COALESCE(ve.description, '''')) LIKE ''%refund paid for pos exchange%''\n        AND EXISTS (\n          SELECT 1\n          FROM public.sales s\n          WHERE s.organization_id = p_organization_id\n            AND s.deleted_at IS NULL\n            AND lower(trim(COALESCE(s.sale_number, ''''))) =\n                lower(trim(substring(COALESCE(ve.description, '''') from ''(?i)refund paid for pos exchange\\s+(.+)$'')))\n            AND COALESCE(s.refund_amount, 0) > 0.005\n        )\n      )\n    GROUP BY ve.reference_id::uuid';
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = '_get_customer_party_balances_rows'
    AND pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid';

  IF d IS NULL THEN
    RAISE EXCEPTION '_get_customer_party_balances_rows not found';
  END IF;
  IF position('customer_payment_refunds AS (' IN d) = 0 THEN
    RAISE EXCEPTION 'CHECK-7: customer_payment_refunds CTE not found in party balances; aborting';
  END IF;
  IF position(old_tail IN d) = 0 THEN
    RAISE EXCEPTION 'CHECK-7: expected customer_payment_refunds tail not found; aborting';
  END IF;

  d := replace(d, old_tail, new_tail);
  EXECUTE d;
END
$mig$;
