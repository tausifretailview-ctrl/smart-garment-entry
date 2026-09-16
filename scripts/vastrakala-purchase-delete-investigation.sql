-- VASTRAKALA SAREES — read-only purchase-bill deletion investigation
-- Org: a4623c1e-fcce-4e5e-8259-4b116ac7d62a  slug: vastrakala-sarees
-- Sale anchor: POS/26-27/1 (2026-09-16)
-- Run in Supabase SQL editor with service_role / postgres. SELECT only — no repairs.

\set org_id 'a4623c1e-fcce-4e5e-8259-4b116ac7d62a'
\set sale_number 'POS/26-27/1'

-- 1) Purchase bill disposition (active vs soft-deleted vs hard-gone)
SELECT
  count(*) FILTER (WHERE deleted_at IS NULL) AS active_bills,
  count(*) FILTER (WHERE deleted_at IS NOT NULL) AS soft_deleted_bills,
  count(*) AS all_bill_rows
FROM purchase_bills
WHERE organization_id = :'org_id'::uuid;

SELECT id, software_bill_no, supplier_invoice_no, bill_date, bill_entry_at,
       deleted_at, deleted_by, is_cancelled, cancelled_at, created_at
FROM purchase_bills
WHERE organization_id = :'org_id'::uuid
ORDER BY COALESCE(deleted_at, created_at) DESC
LIMIT 50;

-- 2) Org reset / wipe (would also hard-delete sales — unlikely if POS/26-27/1 exists)
SELECT *
FROM organization_reset_audit
WHERE organization_id = :'org_id'::uuid
ORDER BY created_at DESC
LIMIT 10;

-- 3) Audit trail for purchase bill deletes (if app logged them)
SELECT created_at, action, entity_type, entity_id, user_id,
       old_values->>'software_bill_no' AS bill_no,
       metadata
FROM audit_logs
WHERE organization_id = :'org_id'::uuid
  AND entity_type ILIKE '%purchase%'
  AND action ILIKE ANY (ARRAY['%delete%', '%soft%', '%cancel%', '%restore%'])
ORDER BY created_at DESC
LIMIT 100;

-- 4) Anchor sale + line items
SELECT s.id, s.sale_number, s.sale_date, s.sale_type, s.total_qty,
       s.gross_amount, s.net_amount, s.paid_amount, s.payment_status,
       s.deleted_at, s.created_at
FROM sales s
WHERE s.organization_id = :'org_id'::uuid
  AND s.sale_number = :'sale_number'
  AND s.deleted_at IS NULL;

SELECT si.id, si.variant_id, si.product_id, si.product_name, si.size,
       si.quantity, si.unit_price, si.line_total, si.deleted_at
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
WHERE s.organization_id = :'org_id'::uuid
  AND s.sale_number = :'sale_number'
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL;

-- 5) Variant stock + master existence
SELECT pv.id AS variant_id, pv.barcode, pv.size, pv.stock_qty, pv.pur_price, pv.mrp,
       pv.deleted_at AS variant_deleted_at,
       p.product_name, p.deleted_at AS product_deleted_at, p.created_in_purchase
FROM sale_items si
JOIN sales s ON s.id = si.sale_id
JOIN product_variants pv ON pv.id = si.variant_id
JOIN products p ON p.id = pv.product_id
WHERE s.organization_id = :'org_id'::uuid
  AND s.sale_number = :'sale_number'
  AND s.deleted_at IS NULL
  AND si.deleted_at IS NULL;

-- 6) Purchase lineage for sold variants (incl. soft-deleted bills/lines)
SELECT pi.id, pi.bill_id, pi.sku_id, pi.qty, pi.pur_price, pi.deleted_at AS pi_deleted_at,
       pb.software_bill_no, pb.supplier_invoice_no, pb.bill_date,
       pb.deleted_at AS pb_deleted_at, pb.deleted_by, pb.is_cancelled
FROM purchase_items pi
JOIN purchase_bills pb ON pb.id = pi.bill_id
WHERE pb.organization_id = :'org_id'::uuid
  AND pi.sku_id IN (
    SELECT si.variant_id
    FROM sale_items si
    JOIN sales s ON s.id = si.sale_id
    WHERE s.organization_id = :'org_id'::uuid
      AND s.sale_number = :'sale_number'
      AND s.deleted_at IS NULL
      AND si.deleted_at IS NULL
  )
ORDER BY pb.bill_date, pi.created_at;

-- 7) Stock movements for anchor sale variants + linked purchase bill ids
SELECT sm.created_at, sm.movement_type, sm.quantity, sm.reference_id, sm.bill_number,
       sm.notes, sm.user_id, sm.deleted_at
FROM stock_movements sm
WHERE sm.organization_id = :'org_id'::uuid
  AND sm.deleted_at IS NULL
  AND (
    sm.variant_id IN (
      SELECT si.variant_id FROM sale_items si
      JOIN sales s ON s.id = si.sale_id
      WHERE s.organization_id = :'org_id'::uuid AND s.sale_number = :'sale_number'
        AND s.deleted_at IS NULL AND si.deleted_at IS NULL
    )
    OR sm.reference_id IN (
      SELECT DISTINCT pi.bill_id FROM purchase_items pi
      JOIN purchase_bills pb ON pb.id = pi.bill_id
      WHERE pb.organization_id = :'org_id'::uuid
        AND pi.sku_id IN (
          SELECT si.variant_id FROM sale_items si
          JOIN sales s ON s.id = si.sale_id
          WHERE s.organization_id = :'org_id'::uuid AND s.sale_number = :'sale_number'
            AND s.deleted_at IS NULL AND si.deleted_at IS NULL
        )
    )
  )
ORDER BY sm.created_at;

-- 8) Orphan purchase stock detector (unreversed purchase credit after bill gone)
SELECT * FROM detect_orphan_purchase_stock(:'org_id'::uuid);

-- 9) Timeline: compare last bill delete vs anchor sale
WITH anchor AS (
  SELECT id, sale_date, created_at FROM sales
  WHERE organization_id = :'org_id'::uuid AND sale_number = :'sale_number' AND deleted_at IS NULL
  LIMIT 1
)
SELECT pb.id, pb.software_bill_no, pb.deleted_at,
       (SELECT sale_date FROM anchor) AS anchor_sale_date,
       (SELECT created_at FROM anchor) AS anchor_sale_created_at,
       pb.deleted_at < (SELECT created_at FROM anchor) AS bill_deleted_before_sale
FROM purchase_bills pb
WHERE pb.organization_id = :'org_id'::uuid
  AND pb.deleted_at IS NOT NULL
ORDER BY pb.deleted_at DESC;

-- 10) Cross-org blast radius: orgs with all purchase bills soft-deleted but recent POS sales
SELECT pb.organization_id, o.name,
       count(*) FILTER (WHERE pb.deleted_at IS NULL) AS active_bills,
       count(*) FILTER (WHERE pb.deleted_at IS NOT NULL) AS deleted_bills
FROM purchase_bills pb
JOIN organizations o ON o.id = pb.organization_id
GROUP BY pb.organization_id, o.name
HAVING count(*) FILTER (WHERE pb.deleted_at IS NULL) = 0
   AND count(*) > 0
ORDER BY count(*) DESC
LIMIT 30;
