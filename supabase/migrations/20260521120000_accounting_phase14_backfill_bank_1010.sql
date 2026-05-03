-- Phase 14: Backfill system "1010 Bank Account" for orgs that already have Cash in Hand (1000).
-- Skips if 1010 exists or another account already uses the name "Bank Account" (unique per org).

INSERT INTO public.chart_of_accounts (
  organization_id,
  account_code,
  account_name,
  account_type,
  parent_account_id,
  is_system_account
)
SELECT
  o.id,
  '1010',
  'Bank Account',
  'Asset',
  NULL,
  true
FROM public.organizations o
WHERE EXISTS (
  SELECT 1
  FROM public.chart_of_accounts c
  WHERE c.organization_id = o.id
    AND c.account_code = '1000'
)
  AND NOT EXISTS (
    SELECT 1
    FROM public.chart_of_accounts c
    WHERE c.organization_id = o.id
      AND c.account_code = '1010'
  )
  AND NOT EXISTS (
    SELECT 1
    FROM public.chart_of_accounts c
    WHERE c.organization_id = o.id
      AND c.account_name = 'Bank Account'
  );
