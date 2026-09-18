-- Optional check BEFORE step 2. Expect 0 rows.
-- If any rows appear, do not create the unique index — those orgs still
-- need the same duplicate-master consolidation.

SELECT
  organization_id,
  LOWER(TRIM(product_name)) AS name_key,
  COUNT(*) AS active_masters
FROM public.products
WHERE deleted_at IS NULL
GROUP BY organization_id, LOWER(TRIM(product_name))
HAVING COUNT(*) > 1
ORDER BY active_masters DESC, organization_id, name_key;
