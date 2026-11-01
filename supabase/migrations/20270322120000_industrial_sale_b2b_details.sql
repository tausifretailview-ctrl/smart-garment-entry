-- Industrial mode, Phase 1 step 2: customer PO and dispatch details on sale bills.
-- One nullable jsonb column, no default: existing bills and retail shops are unchanged.
-- Keys: customer_po_no, customer_po_date, transporter_name, transporter_id, transport_mode,
-- vehicle_no, lr_no, lr_date, distance_km. Written only when Industrial mode is on; the
-- e-way bill step reads it later.

ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS b2b_details jsonb;

COMMENT ON COLUMN public.sales.b2b_details IS 'Industrial mode: customer PO + dispatch details (transporter, vehicle, LR, distance)';
