-- Add DC flag to purchase return.

-- Header-level DC flag (purchase return is delivery challan / no GST)
ALTER TABLE public.purchase_returns
ADD COLUMN IF NOT EXISTS is_dc BOOLEAN NOT NULL DEFAULT FALSE;

-- Item-level DC flag
ALTER TABLE public.purchase_return_items
ADD COLUMN IF NOT EXISTS is_dc BOOLEAN NOT NULL DEFAULT FALSE;

-- Index for dashboard filtering by DC mode
CREATE INDEX IF NOT EXISTS idx_purchase_returns_is_dc
ON public.purchase_returns(organization_id, is_dc);

