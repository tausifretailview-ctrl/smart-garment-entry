-- Industrial mode, Phase 1 step 8: why the goods move on a delivery challan.
-- Nullable column, no default: existing challans and retail shops are unchanged.
-- Written only from Delivery Challan entry when Industrial mode is on.
-- Values: sale_delivery, job_work, supply_on_approval, branch_transfer, repair_return, others.

ALTER TABLE public.delivery_challans ADD COLUMN IF NOT EXISTS challan_type text;

COMMENT ON COLUMN public.delivery_challans.challan_type IS 'Industrial mode: reason for the movement (job work, on approval, stock transfer, ...)';
