DO $mig$
DECLARE d text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO d
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_customer_financial_snapshot_all'
    AND pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid';

  IF d IS NULL THEN RAISE EXCEPTION 'function not found'; END IF;
  IF position('SELECT vs.customer_id FROM valid_sales vs' in d) = 0 THEN
    RAISE EXCEPTION 'expected active_ids pattern not found; aborting';
  END IF;

  d := replace(
    d,
    'SELECT vs.customer_id FROM valid_sales vs',
    'SELECT s_any.customer_id FROM public.sales s_any WHERE s_any.organization_id = p_organization_id AND s_any.deleted_at IS NULL AND s_any.customer_id IS NOT NULL'
  );

  EXECUTE d;
END
$mig$;