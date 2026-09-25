-- Run in Supabase SQL editor: open THIS file in Cursor/VS Code, Ctrl+A, Ctrl+C, paste, Run.
-- Do NOT copy from chat (collapsed "[N lines]" breaks SQL). Do NOT append old $mig$ blocks.
-- Same as supabase/migrations/20261225120000_pos_exchange_refund_voucher_once.sql

DO $pos_exchange_refund_voucher_once$
DECLARE
  d text;
  fn_args text;
  patched int := 0;
  old_tail text := E'      AND lower(COALESCE(ve.voucher_type, '''')) = ''payment''\n      AND lower(COALESCE(ve.reference_type, '''')) = ''customer''\n    GROUP BY ve.reference_id::uuid';
  new_tail text := E'      AND lower(COALESCE(ve.voucher_type, '''')) = ''payment''\n      AND lower(COALESCE(ve.reference_type, '''')) = ''customer''\n      AND NOT (\n        lower(COALESCE(ve.description, '''')) LIKE ''%refund paid for pos exchange%''\n        AND EXISTS (\n          SELECT 1\n          FROM public.sales s\n          WHERE s.organization_id = p_organization_id\n            AND s.deleted_at IS NULL\n            AND lower(trim(COALESCE(s.sale_number, ''''))) =\n                lower(trim(substring(COALESCE(ve.description, '''') from ''(?i)refund paid for pos exchange\\s+(.+)$'')))\n            AND COALESCE(s.refund_amount, 0) > 0.005\n        )\n      )\n    GROUP BY ve.reference_id::uuid';
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
    IF position('refund paid for pos exchange' IN d) > 0
       AND position('COALESCE(s.refund_amount, 0) > 0.005' IN d) > 0 THEN
      RAISE NOTICE 'get_customer_financial_snapshot_all already patched; skipping';
    ELSE
      RAISE EXCEPTION 'CHECK-7: expected customer_payment_refunds tail not found in snapshot; aborting';
    END IF;
  ELSE
    d := replace(d, old_tail, new_tail);
    EXECUTE d;
    RAISE NOTICE 'Patched get_customer_financial_snapshot_all';
  END IF;

  FOR fn_args IN
    SELECT pg_get_function_identity_arguments(p.oid)
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_get_customer_party_balances_rows'
    ORDER BY pg_get_function_identity_arguments(p.oid)
  LOOP
    SELECT pg_get_functiondef(p.oid) INTO d
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = '_get_customer_party_balances_rows'
      AND pg_get_function_identity_arguments(p.oid) = fn_args;

    IF position('customer_payment_refunds AS (' IN d) = 0 THEN
      RAISE NOTICE '_get_customer_party_balances_rows(%) has no customer_payment_refunds CTE; skipping', fn_args;
      CONTINUE;
    END IF;

    IF position(old_tail IN d) = 0 THEN
      IF position('refund paid for pos exchange' IN d) > 0
         AND position('COALESCE(s.refund_amount, 0) > 0.005' IN d) > 0 THEN
        RAISE NOTICE '_get_customer_party_balances_rows(%) already patched; skipping', fn_args;
        patched := patched + 1;
        CONTINUE;
      END IF;
      RAISE EXCEPTION 'CHECK-7: expected customer_payment_refunds tail not found in _get_customer_party_balances_rows(%); aborting', fn_args;
    END IF;

    d := replace(d, old_tail, new_tail);
    EXECUTE d;
    patched := patched + 1;
    RAISE NOTICE 'Patched _get_customer_party_balances_rows(%)', fn_args;
  END LOOP;

  IF patched = 0 THEN
    RAISE EXCEPTION 'CHECK-7: no _get_customer_party_balances_rows overload with customer_payment_refunds was patched';
  END IF;
END
$pos_exchange_refund_voucher_once$;
