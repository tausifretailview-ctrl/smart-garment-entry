-- VASTRAKALA SAREES — read-only purchase-bill deletion investigation
-- Org:  a4623c1e-fcce-4e5e-8259-4b116ac7d62a  (slug: vastrakala-sarees)
-- Sale: POS/26-27/1 (2026-09-16)
--
-- HOW TO RUN (Supabase SQL editor):
--   1. Paste ONE section at a time (or select one query block and Run).
--   2. Do NOT use psql \set — this file uses plain PostgreSQL only.
--   3. To change org/sale, edit the two literals in the "params" CTE at the top of each section.
--   4. Run as postgres / service role (RLS bypass). SELECT only — no repairs.
--
-- NOTE: The soft_delete_purchase_bill stock-guard snippet from the investigation report
-- is PL/pgSQL (inside a function). It cannot be run bare in the SQL editor — use this file.

-- =============================================================================
-- SECTION 1 — Purchase bill disposition (active vs soft-deleted)
-- =============================================================================
WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
)
SELECT
  count(*) FILTER (WHERE pb.deleted_at IS NULL) AS active_bills,
  count(*) FILTER (WHERE pb.deleted_at IS NOT NULL) AS soft_deleted_bills,
  count(*) AS all_bill_rows
FROM purchase_bills pb
CROSS JOIN params p
WHERE pb.organization_id = p.org_id;

WITH params AS (
  SELECT 'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id
)
SELECT
  pb.id,
  pb.software_bill_no,
  pb.supplier_invoice_no,
  pb.bill_date,
  pb.bill_entry_at,
  pb.deleted_at,
  pb.deleted_by,
  pb.is_cancelled,
  pb.cancelled_at,
  pb.created_at
FROM purchase_bills pb
CROSS JOIN params p
WHERE pb.organization_id = p.org_id
ORDER BY COALESCE(pb.deleted_at, pb.created_at) DESC
LIMIT 50;

-- =============================================================================
-- SECTION 2 — Org reset / wipe audit (unlikely: would also delete sales)
-- =============================================================================
WITH params AS (
  SELECT 'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id
)
SELECT ora.*
FROM organization_reset_audit ora
CROSS JOIN params p
WHERE ora.organization_id = p.org_id
ORDER BY ora.created_at DESC
LIMIT 10;

-- =============================================================================
-- SECTION 3 — Audit trail for purchase bill delete/cancel/restore
-- =============================================================================
WITH params AS (
  SELECT 'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id
)
SELECT
  al.created_at,
  al.action,
  al.entity_type,
  al.entity_id,
  al.user_id,
  al.old_values->>'software_bill_no' AS bill_no,
  al.metadata
FROM audit_logs al
CROSS JOIN params p
WHERE al.organization_id = p.org_id
  AND al.entity_type ILIKE '%purchase%'
  AND (
    al.action ILIKE '%delete%'
    OR al.action ILIKE '%soft%'
    OR al.action ILIKE '%cancel%'
    OR al.action ILIKE '%restore%'
  )
ORDER BY al.created_at DESC
LIMIT 100;

-- =============================================================================
-- SECTION 4 — Anchor sale POS/26-27/1 + line items (incl. total_qty vs items)
-- =============================================================================
WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
)
SELECT
  s.id,
  s.sale_number,
  s.sale_date,
  s.sale_type,
  s.total_qty,
  s.gross_amount,
  s.net_amount,
  s.paid_amount,
  s.payment_status,
  s.deleted_at,
  s.created_at,
  (
    SELECT COALESCE(sum(si.quantity), 0)::integer
    FROM sale_items si
    WHERE si.sale_id = s.id
      AND si.deleted_at IS NULL
  ) AS items_qty_sum
FROM sales s
CROSS JOIN params p
WHERE s.organization_id = p.org_id
  AND s.sale_number = p.sale_number
  AND s.deleted_at IS NULL;

WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
)
SELECT
  si.id,
  si.variant_id,
  si.product_id,
  si.product_name,
  si.size,
  si.quantity,
  si.unit_price,
  si.line_total,
  si.deleted_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
CROSS JOIN params p
WHERE s.organization_id = p.org_id
  AND s.sale_number = p.sale_number
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL;

-- =============================================================================
-- SECTION 5 — Variant stock + product master (deleted_at flags)
-- =============================================================================
WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
)
SELECT
  pv.id AS variant_id,
  pv.barcode,
  pv.size,
  pv.stock_qty,
  pv.pur_price,
  pv.mrp,
  pv.deleted_at AS variant_deleted_at,
  p.product_name,
  p.deleted_at AS product_deleted_at,
  p.created_in_purchase
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN product_variants pv ON pv.id = si.variant_id
JOIN products p ON p.id = pv.product_id
CROSS JOIN params pms
WHERE s.organization_id = pms.org_id
  AND s.sale_number = pms.sale_number
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL;

-- =============================================================================
-- SECTION 6 — Purchase lineage for sold variants (incl. soft-deleted bills/lines)
-- =============================================================================
WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
)
SELECT
  pi.id,
  pi.bill_id,
  pi.sku_id,
  pi.qty,
  pi.pur_price,
  pi.deleted_at AS pi_deleted_at,
  pb.software_bill_no,
  pb.supplier_invoice_no,
  pb.bill_date,
  pb.deleted_at AS pb_deleted_at,
  pb.deleted_by,
  pb.is_cancelled
FROM purchase_items pi
JOIN purchase_bills pb ON pb.id = pi.bill_id
CROSS JOIN params pms
WHERE pb.organization_id = pms.org_id
  AND pi.sku_id IN (
    SELECT si.variant_id
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = pms.org_id
      AND s.sale_number = pms.sale_number
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
  )
ORDER BY pb.bill_date, pi.created_at;

-- =============================================================================
-- SECTION 7 — Stock movements (purchase, sale, soft_delete_purchase, etc.)
-- =============================================================================
WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
),
anchor_variants AS (
  SELECT si.variant_id
  FROM sale_items si
  JOIN sales s ON s.id = si.sale_id
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.sale_number = p.sale_number
    AND s.deleted_at IS NULL
    AND si.deleted_at IS NULL
),
linked_bills AS (
  SELECT DISTINCT pi.bill_id
  FROM purchase_items pi
  JOIN purchase_bills pb ON pb.id = pi.bill_id
  CROSS JOIN params p
  WHERE pb.organization_id = p.org_id
    AND pi.sku_id IN (SELECT variant_id FROM anchor_variants)
)
SELECT
  sm.created_at,
  sm.movement_type,
  sm.quantity,
  sm.variant_id,
  sm.reference_id,
  sm.bill_number,
  sm.notes,
  sm.user_id
FROM stock_movements sm
CROSS JOIN params p
WHERE sm.organization_id = p.org_id
  AND sm.deleted_at IS NULL
  AND (
    sm.variant_id IN (SELECT variant_id FROM anchor_variants)
    OR sm.reference_id IN (SELECT bill_id FROM linked_bills)
  )
ORDER BY sm.created_at;

-- =============================================================================
-- SECTION 8 — Orphan purchase stock (unreversed purchase credit after bill gone)
-- =============================================================================
SELECT *
FROM detect_orphan_purchase_stock('a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid);

-- =============================================================================
-- SECTION 9 — Timeline: was each deleted bill removed BEFORE anchor sale?
-- =============================================================================
WITH params AS (
  SELECT
    'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'::uuid AS org_id,
    'POS/26-27/1'::text AS sale_number
),
anchor AS (
  SELECT s.id, s.sale_date, s.created_at
  FROM sales s
  CROSS JOIN params p
  WHERE s.organization_id = p.org_id
    AND s.sale_number = p.sale_number
    AND s.deleted_at IS NULL
  LIMIT 1
)
SELECT
  pb.id,
  pb.software_bill_no,
  pb.deleted_at,
  pb.deleted_by,
  a.sale_date AS anchor_sale_date,
  a.created_at AS anchor_sale_created_at,
  pb.deleted_at < a.created_at AS bill_deleted_before_sale
FROM purchase_bills pb
CROSS JOIN params p
CROSS JOIN anchor a
WHERE pb.organization_id = p.org_id
  AND pb.deleted_at IS NOT NULL
ORDER BY pb.deleted_at DESC;

-- =============================================================================
-- SECTION 10 — Cross-org: orgs with zero active purchase bills (pattern scan)
-- =============================================================================
SELECT
  pb.organization_id,
  o.name,
  count(*) FILTER (WHERE pb.deleted_at IS NULL) AS active_bills,
  count(*) FILTER (WHERE pb.deleted_at IS NOT NULL) AS deleted_bills
FROM purchase_bills pb
JOIN organizations o ON o.id = pb.organization_id
GROUP BY pb.organization_id, o.name
HAVING count(*) FILTER (WHERE pb.deleted_at IS NULL) = 0
   AND count(*) > 0
ORDER BY count(*) DESC
LIMIT 30;
