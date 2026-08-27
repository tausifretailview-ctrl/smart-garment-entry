-- Quick check before smoke / Step 3. Expect exists = true.
SELECT EXISTS (
  SELECT 1
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'get_customer_financial_snapshot_all'
    AND pg_get_function_identity_arguments(p.oid) = 'p_organization_id uuid'
) AS snapshot_all_exists;
