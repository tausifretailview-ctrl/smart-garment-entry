-- Reviewed dry-run export 2026-10-04 (18 commission rows, 20 join lines).
-- ADEEBAAREEBA only. Moves employee_name onto the line salesman.
-- Does not change sale_amount, commission_amount, or payment_status.
-- Tag: [commission_line_salesman_repair_20261004]
-- POS/26-27/521 listed twice per row in the export because two identical
-- CO ORD SET lines matched both commission rows. DISTINCT ON applies each once.

WITH matches AS (
  SELECT DISTINCT ON (sc.id)
    sc.id,
    btrim(si.salesman) AS salesman_after
  FROM public.salesman_commissions sc
  JOIN public.sale_items si
    ON si.sale_id = sc.sale_id
   AND si.organization_id = sc.organization_id
   AND si.deleted_at IS NULL
   AND (
     (sc.product_id IS NOT NULL AND si.product_id::text = sc.product_id)
     OR lower(btrim(COALESCE(si.product_name, ''))) = lower(btrim(COALESCE(sc.product_name, '')))
   )
  WHERE sc.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
    AND sc.id IN (
      '358fd9be-b5fd-4a3e-bc0d-8fe9ac721576',
      '50c8a6bd-6448-449b-8706-580cc098bb33',
      '59139d47-7115-4f03-a73f-0623802be578',
      '5be3555f-d679-4f7c-a83b-8be38da548f6',
      '72a24d7d-8856-4f88-9a38-c46c25716b41',
      '7f371696-aeb1-4572-9eaf-5fe4368e8148',
      '8616bc79-5896-4d59-9a3e-f4aa18616bce',
      '8de7b9b8-268b-4ca6-a70c-75681da561e8',
      '92c2c3b3-d49d-444d-9bb2-62e67c5a6fd2',
      '998da82e-5141-48db-8a05-d289c07fcebb',
      '9e399af1-f80b-449b-99fd-7dcea29d05a8',
      'a4e5b96c-6db2-43db-bb27-09cee71f0a48',
      'afc334d4-c2ac-4e15-ba32-162ed087b671',
      'c7615d58-b6cf-4d77-995f-aec18ce19d20',
      'd19211bd-5695-4baa-9af9-c893a2cfc58b',
      'e02e1e28-af7d-4410-94d6-c67399d1fa99',
      'f2774da3-c610-41e4-8bf8-ee84e83f8a65',
      'f4207a27-e2e3-4f43-beb1-9f387a36492a'
    )
    AND sc.payment_status = 'pending'
    AND sc.commission_amount = 0
    AND btrim(COALESCE(si.salesman, '')) <> ''
    AND btrim(si.salesman) <> btrim(COALESCE(sc.employee_name, ''))
    AND abs(
      CASE
        WHEN COALESCE(si.net_after_discount, 0) > 0 THEN si.net_after_discount
        ELSE GREATEST(0::numeric, COALESCE(si.line_total, 0) - COALESCE(si.discount_share, 0))
      END - COALESCE(sc.sale_amount, 0)
    ) <= 0.05
  ORDER BY sc.id, si.created_at, si.id
)
UPDATE public.salesman_commissions sc
SET
  employee_name = m.salesman_after,
  employee_id = (
    SELECT e.id
    FROM public.employees e
    WHERE e.organization_id = sc.organization_id
      AND e.deleted_at IS NULL
      AND e.employee_name = m.salesman_after
    ORDER BY e.created_at
    LIMIT 1
  ),
  notes = CASE
    WHEN COALESCE(sc.notes, '') LIKE '%[commission_line_salesman_repair_20261004]%' THEN sc.notes
    WHEN btrim(COALESCE(sc.notes, '')) = '' THEN '[commission_line_salesman_repair_20261004]'
    ELSE btrim(sc.notes) || ' [commission_line_salesman_repair_20261004]'
  END,
  updated_at = now()
FROM matches m
WHERE sc.id = m.id
  AND sc.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
  AND EXISTS (
    SELECT 1
    FROM public.employees e
    WHERE e.organization_id = sc.organization_id
      AND e.deleted_at IS NULL
      AND e.employee_name = m.salesman_after
  )
RETURNING sc.sale_number, sc.employee_name, sc.employee_id, sc.commission_amount, sc.payment_status;
