-- Purchase-bill 57014 frequency since the price-tier batch fix (ecf418aab, 2026-08-27 15:59 UTC).
-- Run as platform admin / SQL editor (RLS hides app_error_logs from anon).
-- logError on Draft Preserved writes operation='purchase_bill_save' and
-- additional_context.lineItemsCount.

-- 1) Counts by day / code
SELECT
  (created_at AT TIME ZONE 'Asia/Kolkata')::date AS ist_day,
  COALESCE(error_code, '(null)') AS error_code,
  COUNT(*) AS n,
  COUNT(*) FILTER (
    WHERE error_code = '57014'
       OR error_message ILIKE '%statement timeout%'
  ) AS n_timeout
FROM public.app_error_logs
WHERE operation = 'purchase_bill_save'
  AND created_at >= TIMESTAMPTZ '2026-08-27 16:00:00+00'
GROUP BY 1, 2
ORDER BY 1 DESC, n DESC;

-- 2) Timeout rows with bill size (this decides rare-vs-routine)
SELECT
  created_at,
  organization_id,
  error_code,
  LEFT(error_message, 180) AS error_message,
  additional_context ->> 'lineItemsCount' AS line_items,
  additional_context ->> 'isEditMode' AS is_edit,
  additional_context ->> 'editingBillId' AS editing_bill_id,
  additional_context ->> 'supplierInvoice' AS supplier_invoice
FROM public.app_error_logs
WHERE operation = 'purchase_bill_save'
  AND created_at >= TIMESTAMPTZ '2026-08-27 16:00:00+00'
  AND (
    error_code = '57014'
    OR error_message ILIKE '%statement timeout%'
  )
ORDER BY created_at DESC
LIMIT 50;

-- 3) Size buckets for timeouts only
SELECT
  CASE
    WHEN NULLIF(additional_context ->> 'lineItemsCount', '')::int IS NULL THEN 'unknown'
    WHEN (additional_context ->> 'lineItemsCount')::int < 50 THEN '1-49'
    WHEN (additional_context ->> 'lineItemsCount')::int < 100 THEN '50-99'
    WHEN (additional_context ->> 'lineItemsCount')::int < 200 THEN '100-199'
    ELSE '200+'
  END AS line_bucket,
  COUNT(*) AS n,
  MIN((additional_context ->> 'lineItemsCount')::int) AS min_lines,
  MAX((additional_context ->> 'lineItemsCount')::int) AS max_lines
FROM public.app_error_logs
WHERE operation = 'purchase_bill_save'
  AND created_at >= TIMESTAMPTZ '2026-08-27 16:00:00+00'
  AND (
    error_code = '57014'
    OR error_message ILIKE '%statement timeout%'
  )
GROUP BY 1
ORDER BY 1;

-- 4) Headline: rare-vs-routine + edit vs create + line-count percentiles
--    (same window as above; run as platform admin)
SELECT
  COUNT(*) AS timeout_saves,
  COUNT(*) FILTER (
    WHERE COALESCE((additional_context->>'isEditMode')::boolean, false)
  ) AS edit_saves,
  COUNT(*) FILTER (
    WHERE NOT COALESCE((additional_context->>'isEditMode')::boolean, false)
  ) AS create_saves,
  MIN((additional_context->>'lineItemsCount')::int) AS min_lines,
  PERCENTILE_CONT(0.50) WITHIN GROUP (
    ORDER BY (additional_context->>'lineItemsCount')::int
  ) AS p50_lines,
  PERCENTILE_CONT(0.90) WITHIN GROUP (
    ORDER BY (additional_context->>'lineItemsCount')::int
  ) AS p90_lines,
  MAX((additional_context->>'lineItemsCount')::int) AS max_lines
FROM public.app_error_logs
WHERE created_at >= TIMESTAMPTZ '2026-08-27 16:00:00+00'
  AND operation = 'purchase_bill_save'
  AND (
    error_code = '57014'
    OR error_message ILIKE '%statement timeout%'
    OR error_message ILIKE '%57014%'
    OR error_message ILIKE '%canceling statement due to statement timeout%'
  );
