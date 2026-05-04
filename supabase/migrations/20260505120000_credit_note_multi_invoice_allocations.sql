-- Multi-invoice credit note: remaining balance on CN + audit rows per invoice allocation
ALTER TABLE public.sale_returns
  ADD COLUMN IF NOT EXISTS credit_available_balance NUMERIC;

COMMENT ON COLUMN public.sale_returns.credit_available_balance IS
  'Remaining CN rupees to allocate. NULL = legacy row (treat as full net_amount while pending).';

CREATE TABLE IF NOT EXISTS public.sale_return_invoice_allocations (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_return_id UUID NOT NULL REFERENCES public.sale_returns(id) ON DELETE CASCADE,
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  amount NUMERIC NOT NULL CHECK (amount > 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_sr_invoice_alloc_return
  ON public.sale_return_invoice_allocations (sale_return_id);

CREATE INDEX IF NOT EXISTS idx_sr_invoice_alloc_org
  ON public.sale_return_invoice_allocations (organization_id);

-- Legacy pending CNs: treat full net_amount as remaining until first allocation
UPDATE public.sale_returns
SET credit_available_balance = net_amount
WHERE credit_available_balance IS NULL
  AND deleted_at IS NULL
  AND (credit_status IS NULL OR credit_status = 'pending');
