-- =============================================================================
-- Part 2 — number-series duplicate forensic (READ-ONLY)
-- =============================================================================
-- Run before each generator race-safe migration. Paste each result set.
-- See docs/voucher-number-race-safe-part2-triage.md
-- =============================================================================

-- ADV — no unique today (silent dups possible)
SELECT organization_id, advance_number, COUNT(*) AS n
FROM public.customer_advances
WHERE advance_number IS NOT NULL AND btrim(advance_number) <> ''
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY n DESC, organization_id, advance_number
LIMIT 200;

-- DC (classic table) — no unique on challan_number
SELECT organization_id, challan_number, COUNT(*) AS n
FROM public.delivery_challans
WHERE deleted_at IS NULL
  AND challan_number IS NOT NULL AND btrim(challan_number) <> ''
GROUP BY 1, 2
HAVING COUNT(*) > 1
ORDER BY n DESC
LIMIT 200;

-- CN — unique exists; expect 0 active dups (races surface as insert failures)
SELECT organization_id, credit_note_number, COUNT(*) AS n
FROM public.credit_notes
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
LIMIT 50;

-- SR
SELECT organization_id, return_number, COUNT(*) AS n
FROM public.sale_returns
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
LIMIT 50;

-- SO
SELECT organization_id, order_number, COUNT(*) AS n
FROM public.sale_orders
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
LIMIT 50;

-- PO
SELECT organization_id, order_number, COUNT(*) AS n
FROM public.purchase_orders
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
LIMIT 50;

-- PR
SELECT organization_id, return_number, COUNT(*) AS n
FROM public.purchase_returns
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
LIMIT 50;

-- QT
SELECT organization_id, quotation_number, COUNT(*) AS n
FROM public.quotations
WHERE deleted_at IS NULL
GROUP BY 1, 2
HAVING COUNT(*) > 1
LIMIT 50;

-- Summary counts (how many duplicate groups per series)
SELECT 'ADV' AS series, COUNT(*) AS dup_groups FROM (
  SELECT 1 FROM public.customer_advances
  GROUP BY organization_id, advance_number HAVING COUNT(*) > 1
) s
UNION ALL
SELECT 'DC', COUNT(*) FROM (
  SELECT 1 FROM public.delivery_challans WHERE deleted_at IS NULL
  GROUP BY organization_id, challan_number HAVING COUNT(*) > 1
) s
UNION ALL
SELECT 'CN', COUNT(*) FROM (
  SELECT 1 FROM public.credit_notes WHERE deleted_at IS NULL
  GROUP BY organization_id, credit_note_number HAVING COUNT(*) > 1
) s
UNION ALL
SELECT 'SR', COUNT(*) FROM (
  SELECT 1 FROM public.sale_returns WHERE deleted_at IS NULL
  GROUP BY organization_id, return_number HAVING COUNT(*) > 1
) s;
