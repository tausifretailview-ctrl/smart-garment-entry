BEGIN;

-- Move RCP/626 from INV/1347 to INV/1456
UPDATE public.repair_ks_receipt_reallocation_20260813
SET original_reference_id = new_reference_id,
    new_reference_id = '9d71d13c-8d16-4b4a-8b89-747ea7e9f027'::UUID
WHERE id = '31f20d5e-a853-42db-8682-c3fe829d4224'::UUID;

UPDATE public.voucher_entries ve
SET reference_id = '9d71d13c-8d16-4b4a-8b89-747ea7e9f027'::UUID
WHERE ve.id = '31f20d5e-a853-42db-8682-c3fe829d4224'::UUID;

-- Recompute affected TRIMBAK sales
UPDATE public.sales s
SET paid_amount = cs.new_paid,
    payment_status = cs.new_status
FROM (
    SELECT s2.id AS sale_id, cst.new_paid, cst.new_status
    FROM public.sales s2
    CROSS JOIN LATERAL public.compute_sale_settlement(s2.id, s2.organization_id) cst
    WHERE s2.id IN ('a2db25f3-d13e-471d-9c82-e09d47ea4a13'::UUID, '9d71d13c-8d16-4b4a-8b89-747ea7e9f027'::UUID)
    AND s2.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
) cs
WHERE s.id = cs.sale_id;

COMMIT;