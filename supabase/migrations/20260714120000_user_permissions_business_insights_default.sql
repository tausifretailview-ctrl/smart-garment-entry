-- Business Insights: on by default for all orgs; admins can disable per user in User Rights.
-- Only backfill when the menu key was never saved (do not override explicit false).

UPDATE public.user_permissions
SET permissions = jsonb_set(
  COALESCE(permissions, '{}'::jsonb),
  '{menu,business_insights}',
  'true'::jsonb,
  true
)
WHERE permissions IS NOT NULL
  AND (permissions->'menu'->>'business_insights') IS NULL;
