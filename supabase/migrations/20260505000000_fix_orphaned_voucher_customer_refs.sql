-- Fix orphaned customer references in voucher_entries by inferring current customer_id from sales links.
-- Safety guard: UPDATE is intentionally commented out for manual execution after review.

-- Create a temporary mapping table to log all changes (for rollback safety)
CREATE TEMP TABLE _orphan_fixes AS
SELECT
  ve.id AS voucher_id,
  ve.voucher_number,
  ve.reference_id AS old_customer_id,
  s.customer_id AS new_customer_id,
  ve.total_amount,
  ve.organization_id
FROM voucher_entries ve
JOIN sales s ON s.organization_id = ve.organization_id
  AND s.sale_number = (regexp_match(ve.description, 'INV/[0-9]+-[0-9]+/[0-9]+'))[1]
JOIN customers c_new ON c_new.id = s.customer_id
  AND c_new.deleted_at IS NULL
WHERE ve.deleted_at IS NULL
  AND ve.reference_type = 'customer'
  AND NOT EXISTS (
    SELECT 1 FROM customers c WHERE c.id = ve.reference_id
  );

-- Show what will be fixed (for audit)
SELECT
  'Would update ' || count(*) || ' voucher rows across '
  || count(DISTINCT old_customer_id) || ' orphaned customer ids' AS summary
FROM _orphan_fixes;

SELECT * FROM _orphan_fixes ORDER BY voucher_number LIMIT 100;

-- The actual update — DO NOT RUN automatically. Manual confirmation required.
-- Uncomment to execute after reviewing _orphan_fixes:
--
-- UPDATE voucher_entries ve
-- SET reference_id = of.new_customer_id
-- FROM _orphan_fixes of
-- WHERE ve.id = of.voucher_id;
