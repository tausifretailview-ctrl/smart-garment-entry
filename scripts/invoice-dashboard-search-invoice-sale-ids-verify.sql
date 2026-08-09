-- =============================================================================
-- Verify search_invoice_sale_ids (Item 3) — ELLA NOOR
-- =============================================================================
-- Org is hard-coded (no :org_id placeholder).
-- Run EACH query separately in the SQL editor (EXPLAIN returns one plan at a time).
-- BEFORE applying 20261111120000: save plans. AFTER: compare.
-- =============================================================================

-- 0) Confirm org
SELECT id, name FROM public.organizations
WHERE id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid;

-- 0b) Pick a real product/barcode fragment for queries B–D (copy into B/C/D if needed)
SELECT si.barcode, si.product_name
FROM public.sale_items si
JOIN public.sales s ON s.id = si.sale_id
WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND s.sale_type = 'invoice'
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL
  AND COALESCE(si.barcode, '') <> ''
ORDER BY si.created_at DESC
LIMIT 5;


-- A) Customer-name term (expect ~0 line-item sale ids — wasted work today)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  'ANUSHA PATHAN',
  NULL,
  NULL,
  1000
);


-- B) Product / barcode — uses a sample barcode from this org (re-run 0b if empty)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  (
    SELECT LEFT(si.barcode, 8)
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND length(COALESCE(si.barcode, '')) >= 8
    ORDER BY si.created_at DESC
    LIMIT 1
  ),
  NULL,
  NULL,
  1000
);


-- C) Date-bounded (last 30 days)
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
SELECT * FROM public.search_invoice_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  (
    SELECT LEFT(si.barcode, 8)
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND length(COALESCE(si.barcode, '')) >= 8
    ORDER BY si.created_at DESC
    LIMIT 1
  ),
  CURRENT_DATE - 30,
  CURRENT_DATE,
  1000
);


-- D) Result count smoke (same term as B)
SELECT COUNT(*) AS n FROM public.search_invoice_sale_ids(
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid,
  (
    SELECT LEFT(si.barcode, 8)
    FROM public.sale_items si
    JOIN public.sales s ON s.id = si.sale_id
    WHERE s.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND length(COALESCE(si.barcode, '')) >= 8
    ORDER BY si.created_at DESC
    LIMIT 1
  ),
  NULL,
  NULL,
  1000
);
