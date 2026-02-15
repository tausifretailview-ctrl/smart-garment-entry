
-- Create advance_refunds table for tracking refund history
CREATE TABLE public.advance_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  advance_id UUID NOT NULL REFERENCES public.customer_advances(id),
  refund_amount NUMERIC NOT NULL,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.advance_refunds ENABLE ROW LEVEL SECURITY;

-- RLS policies (organization-scoped)
CREATE POLICY "Users can view refunds in their organization"
ON public.advance_refunds FOR SELECT
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create refunds in their organization"
ON public.advance_refunds FOR INSERT
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Index for performance
CREATE INDEX idx_advance_refunds_org_id ON public.advance_refunds(organization_id);
CREATE INDEX idx_advance_refunds_advance_id ON public.advance_refunds(advance_id);
