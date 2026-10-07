-- Dry-run only. Lists ADEEBAAREEBA commission rows whose piece belongs to a
-- different line salesman. Do not UPDATE from this file.
-- Org: b230c582-4f0b-420f-b18b-bef26c2f5ce8 (slug adeebaareeba)
-- The repair migration is 20270104150000_adeeba_commission_line_salesman.sql.
-- It changes employee_name / employee_id only. sale_amount, commission_amount,
-- and payment_status stay. Hand-check at least five rows here before applying.

SELECT *
FROM (
SELECT DISTINCT ON (sc.id)
  sc.sale_number,
  sc.sale_date::date AS sale_date,
  sc.product_name,
  si.quantity AS line_qty,
  round(sc.sale_amount::numeric, 2) AS sale_amount_before,
  round(sc.sale_amount::numeric, 2) AS sale_amount_after,
  round(sc.commission_amount::numeric, 2) AS commission_amount_before,
  round(sc.commission_amount::numeric, 2) AS commission_amount_after,
  sc.payment_status,
  btrim(sc.employee_name) AS salesman_before,
  btrim(si.salesman) AS salesman_after,
  sc.id AS commission_id,
  si.id AS sale_item_id
FROM public.salesman_commissions sc
JOIN public.sale_items si
  ON si.sale_id = sc.sale_id
 AND si.organization_id = sc.organization_id
 AND si.deleted_at IS NULL
 AND (
   (sc.product_id IS NOT NULL AND si.product_id::text = sc.product_id)
   OR lower(btrim(COALESCE(si.product_name, ''))) = lower(btrim(COALESCE(sc.product_name, '')))
 )
JOIN public.sales s
  ON s.id = sc.sale_id
 AND s.organization_id = sc.organization_id
 AND s.deleted_at IS NULL
WHERE sc.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
  AND btrim(COALESCE(si.salesman, '')) <> ''
  AND btrim(si.salesman) <> btrim(COALESCE(sc.employee_name, ''))
  AND abs(
    CASE
      WHEN COALESCE(si.net_after_discount, 0) > 0 THEN si.net_after_discount
      ELSE GREATEST(0::numeric, COALESCE(si.line_total, 0) - COALESCE(si.discount_share, 0))
    END - COALESCE(sc.sale_amount, 0)
  ) <= 0.05
ORDER BY sc.id, si.created_at, si.id
) reviewed
ORDER BY sale_date, sale_number, commission_id;
