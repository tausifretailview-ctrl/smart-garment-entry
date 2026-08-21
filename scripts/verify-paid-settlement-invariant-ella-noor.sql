-- After applying 20261121120000_paid_amount_settlement_invariant.sql:
-- paid_diverges_from_receipts must surface remaining ELLA NOOR paid≠settlement rows
-- (cn_over_apply_repair_20260606). Zero rows here means the invariant is wrong or
-- those invoices were already repaired.

SELECT
  i.entity_ref AS sale_number,
  i.detail AS recorded_minus_expected,
  s.paid_amount AS recorded_paid,
  c.new_paid AS expected_paid
FROM public.v_accounting_invariants i
JOIN public.sales s ON s.id = i.entity_id
CROSS JOIN LATERAL public.compute_sale_settlement(s.id, s.organization_id) c
WHERE i.check_name = 'paid_diverges_from_receipts'
  AND i.organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67' -- ELLA NOOR / ella-noor
ORDER BY abs(i.detail) DESC
LIMIT 50;

-- Per-org rollup (platform admin / service role):
-- SELECT public.get_paid_settlement_mismatch_digest();
