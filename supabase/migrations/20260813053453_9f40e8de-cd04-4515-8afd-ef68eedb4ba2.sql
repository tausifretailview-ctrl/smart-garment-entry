BEGIN;

-- Revert the MULTI SHOES move in the audit table
UPDATE public.repair_ks_receipt_reallocation_20260813
SET new_reference_id = original_reference_id
WHERE id = 'd6d9272f-1a9d-4d20-bea7-f0d35843ab1e'::UUID;

-- Move RCP/487 back to INV/410
UPDATE public.voucher_entries ve
SET reference_id = original_reference_id
FROM public.repair_ks_receipt_reallocation_20260813 b
WHERE ve.id = b.id AND b.voucher_number = 'RCP/25-26/487';

-- Recompute both affected invoices
UPDATE public.sales s
SET paid_amount = cs.new_paid,
    payment_status = cs.new_status
FROM (
    SELECT s2.id AS sale_id, cst.new_paid, cst.new_status
    FROM public.sales s2
    CROSS JOIN LATERAL public.compute_sale_settlement(s2.id, s2.organization_id) cst
    WHERE s2.id IN ('5a2ba4c2-0cc0-40a8-a190-76916bc866ee'::UUID, 'b49114b2-8915-4b4b-8e62-5f13faea4f9c'::UUID)
    AND s2.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
) cs
WHERE s.id = cs.sale_id;

COMMIT;