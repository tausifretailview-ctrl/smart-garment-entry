-- Org-wide parity audit between the two canonical customer-outstanding paths:
--   * DB:  public.get_customer_true_outstanding(customer_id, organization_id)
--   * RPC: public.reconcile_customer_balances(organization_id).calculated_balance
--
-- These MUST agree (the RPC literally calls the DB function for
-- calculated_balance). Drift here = the function changed under one but the
-- other was not re-run / cached / there is an RLS visibility gap.
--
-- Replace :org_id with the target organization UUID.

WITH rpc AS (
  SELECT customer_id, calculated_balance
  FROM public.reconcile_customer_balances(:'org_id'::uuid)
),
direct AS (
  SELECT c.id AS customer_id,
         public.get_customer_true_outstanding(c.id, :'org_id'::uuid) AS direct_balance
  FROM public.customers c
  WHERE c.organization_id = :'org_id'::uuid
    AND c.deleted_at IS NULL
)
SELECT
  d.customer_id,
  c.customer_name,
  rpc.calculated_balance,
  d.direct_balance,
  ROUND(rpc.calculated_balance - d.direct_balance, 2) AS drift
FROM direct d
LEFT JOIN rpc ON rpc.customer_id = d.customer_id
JOIN public.customers c ON c.id = d.customer_id
WHERE ABS(COALESCE(rpc.calculated_balance, 0) - COALESCE(d.direct_balance, 0)) > 1
ORDER BY ABS(COALESCE(rpc.calculated_balance, 0) - COALESCE(d.direct_balance, 0)) DESC;

-- Then, for each row above, compare against the front-end ledger:
--   SELECT * FROM public.reconcile_customer_balance('<cust_id>', '<org_id>');
-- and identify which source bucket disagrees with the on-screen number.