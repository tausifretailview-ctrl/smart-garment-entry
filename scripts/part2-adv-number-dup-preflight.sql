-- ADV Part 2.0 preflight (READ-ONLY) — run before
-- 20261110120000_advance_number_race_safe.sql

SELECT organization_id, advance_number, COUNT(*) AS n,
       array_agg(id ORDER BY created_at NULLS LAST, id) AS ids
FROM public.customer_advances
WHERE advance_number IS NOT NULL AND btrim(advance_number) <> ''
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY n DESC
LIMIT 200;

SELECT COUNT(*) AS dup_groups FROM (
  SELECT 1
  FROM public.customer_advances
  GROUP BY organization_id, advance_number
  HAVING COUNT(*) > 1
) s;
