-- =============================================================================
-- Verify search_invoice_sale_ids (Item 3) — ELLA NOOR
-- =============================================================================
-- Org is hard-coded (no :org_id placeholder).
-- Run EACH query separately in the SQL editor (EXPLAIN returns one plan at a time).
-- BEFORE applying 20261111120000: save plans. AFTER: compare.
--
-- AUTH (required for A–D):
--   Supabase SQL Editor has no JWT → auth.uid() is NULL → assert_org_member
--   raises: ERROR 42501 Authentication required.
--   Run 0c once per editor session before any RPC call (A–D).
--   Live app already sends a member JWT; this is editor-only.
--
-- If 0c fails (no members / claims ignored), use E–G (body-only EXPLAIN) —
-- same UNION shape as the RPC, no assert_org_member. Good for plan timing.
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

-- 0c) Impersonate an org member for this SQL-editor session (run once before A–D)
SELECT om.user_id, om.role
FROM public.organization_members om
WHERE om.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
ORDER BY om.created_at
LIMIT 5;

SELECT set_config(
  'request.jwt.claims',
  json_build_object(
    'sub', (
      SELECT om.user_id::text
      FROM public.organization_members om
      WHERE om.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
      ORDER BY om.created_at
      LIMIT 1
    ),
    'role', 'authenticated'
  )::text,
  true
) AS jwt_claims_set;

SELECT auth.uid() AS impersonated_uid;
-- Expect a non-null uuid. If NULL, skip A–D and use E–G instead.


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


-- =============================================================================
-- E–G) Body-only EXPLAIN (no RPC / no assert_org_member) — SQL-editor safe
-- Mirrors post-migration UNION shape. Use for plan timing if 0c cannot set auth.
-- =============================================================================

-- E) Customer-name term — expect ~0 rows / sequential scans across branches
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
    'ANUSHA PATHAN'::text AS q,
    1000 AS lim
)
SELECT u.sale_id
FROM (
  (
    SELECT s.id AS sale_id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.product_name ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.barcode ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.size ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.color ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.products pr
    INNER JOIN public.sale_items si ON si.product_id = pr.id AND si.deleted_at IS NULL
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE pr.organization_id = p.org_id
      AND pr.deleted_at IS NULL
      AND s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND pr.style ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.products pr
    INNER JOIN public.sale_items si ON si.product_id = pr.id AND si.deleted_at IS NULL
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE pr.organization_id = p.org_id
      AND pr.deleted_at IS NULL
      AND s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND pr.category ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.products pr
    INNER JOIN public.sale_items si ON si.product_id = pr.id AND si.deleted_at IS NULL
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE pr.organization_id = p.org_id
      AND pr.deleted_at IS NULL
      AND s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND pr.brand ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
) u
LIMIT (SELECT lim FROM params);


-- F) Product / barcode fragment (auto sample) — after migration expect Bitmap Index Scan on gin_trgm
EXPLAIN (ANALYZE, BUFFERS, FORMAT TEXT)
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
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
    ) AS q,
    1000 AS lim
)
SELECT u.sale_id
FROM (
  (
    SELECT s.id AS sale_id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.product_name ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.barcode ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.size ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.sale_items si
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
      AND si.color ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.products pr
    INNER JOIN public.sale_items si ON si.product_id = pr.id AND si.deleted_at IS NULL
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE pr.organization_id = p.org_id
      AND pr.deleted_at IS NULL
      AND s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND pr.style ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.products pr
    INNER JOIN public.sale_items si ON si.product_id = pr.id AND si.deleted_at IS NULL
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE pr.organization_id = p.org_id
      AND pr.deleted_at IS NULL
      AND s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND pr.category ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
  UNION
  (
    SELECT s.id
    FROM public.products pr
    INNER JOIN public.sale_items si ON si.product_id = pr.id AND si.deleted_at IS NULL
    INNER JOIN public.sales s ON s.id = si.sale_id
    CROSS JOIN params p
    WHERE pr.organization_id = p.org_id
      AND pr.deleted_at IS NULL
      AND s.organization_id = p.org_id
      AND s.sale_type = 'invoice'
      AND s.deleted_at IS NULL
      AND pr.brand ILIKE '%' || p.q || '%'
    LIMIT (SELECT lim FROM params)
  )
) u
LIMIT (SELECT lim FROM params);


-- G) Body-only count smoke (same term as F)
WITH params AS (
  SELECT
    '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid AS org_id,
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
    ) AS q,
    1000 AS lim
)
SELECT COUNT(*) AS n
FROM (
  SELECT u.sale_id
  FROM (
    (
      SELECT s.id AS sale_id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      CROSS JOIN params p
      WHERE s.organization_id = p.org_id
        AND s.sale_type = 'invoice'
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND si.barcode ILIKE '%' || p.q || '%'
      LIMIT (SELECT lim FROM params)
    )
  ) u
) t;
