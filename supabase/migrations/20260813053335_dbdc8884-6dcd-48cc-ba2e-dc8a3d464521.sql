BEGIN;

-- Backup table for rollback / audit
CREATE TABLE IF NOT EXISTS public.repair_ks_receipt_reallocation_20260813 (
    id UUID PRIMARY KEY,
    original_reference_id UUID NOT NULL,
    new_reference_id UUID NOT NULL,
    voucher_number TEXT NOT NULL,
    total_amount NUMERIC(12,2) NOT NULL,
    moved_at TIMESTAMPTZ DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.repair_ks_receipt_reallocation_20260813 TO authenticated;
GRANT ALL ON public.repair_ks_receipt_reallocation_20260813 TO service_role;

ALTER TABLE public.repair_ks_receipt_reallocation_20260813 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Organization members can view repair audit" ON public.repair_ks_receipt_reallocation_20260813 FOR SELECT USING (EXISTS (
    SELECT 1 FROM public.organization_members om WHERE om.user_id = auth.uid() AND om.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
));

-- Snapshot the moves
INSERT INTO public.repair_ks_receipt_reallocation_20260813 (id, original_reference_id, new_reference_id, voucher_number, total_amount)
SELECT v.id, v.reference_id, t.new_reference_id, v.voucher_number, v.total_amount
FROM public.voucher_entries v
JOIN (VALUES
    ('388c03ce-1970-4736-9dbe-509c2911724f'::UUID, '8b3438d8-722c-45ba-b697-470a0010e6af'::UUID),
    ('4990b7aa-41f2-4cbf-94b9-7be9261de783'::UUID, 'b695600c-c6c1-4c84-b9e1-c28dea34f724'::UUID),
    ('d6d9272f-1a9d-4d20-bea7-f0d35843ab1e'::UUID, 'b49114b2-8915-4b4b-8e62-5f13faea4f9c'::UUID),
    ('bf5cb0d2-1246-4e20-8907-abfdafc37c97'::UUID, '27df08d4-2960-4e82-a839-f6d50377496d'::UUID),
    ('31f20d5e-a853-42db-8682-c3fe829d4224'::UUID, 'a2db25f3-d13e-471d-9c82-e09d47ea4a13'::UUID),
    ('a5bb7cbe-1bff-4eec-9696-c4815a697290'::UUID, '82862f8c-994e-45b0-8b91-ff2bc92b8df2'::UUID),
    ('9bf55dd4-d6ba-41b5-825c-9392cca59eef'::UUID, '17f1e550-23ab-4dbe-8661-c834cff5a783'::UUID),
    ('b7d338d4-26ef-404c-bb07-9d3b208b059f'::UUID, '9d71d13c-8d16-4b4a-8b89-747ea7e9f027'::UUID)
) AS t(voucher_id, new_reference_id) ON v.id = t.voucher_id
ON CONFLICT (id) DO NOTHING;

-- Reassign the vouchers to the target open invoices
UPDATE public.voucher_entries ve
SET reference_id = b.new_reference_id
FROM public.repair_ks_receipt_reallocation_20260813 b
WHERE ve.id = b.id;

-- Recompute paid_amount / payment_status for every source and target invoice
UPDATE public.sales s
SET paid_amount = cs.new_paid,
    payment_status = cs.new_status
FROM (
    SELECT s2.id AS sale_id, cst.new_paid, cst.new_status
    FROM public.sales s2
    CROSS JOIN LATERAL public.compute_sale_settlement(s2.id, s2.organization_id) cst
    WHERE s2.id IN (
        SELECT original_reference_id FROM public.repair_ks_receipt_reallocation_20260813
        UNION
        SELECT new_reference_id FROM public.repair_ks_receipt_reallocation_20260813
    )
    AND s2.organization_id = '4bc73037-e877-4123-9261-eb6e3876698c'
) cs
WHERE s.id = cs.sale_id;

COMMIT;