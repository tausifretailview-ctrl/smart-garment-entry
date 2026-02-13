
-- Create table for customer balance adjustments
CREATE TABLE public.customer_balance_adjustments (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  customer_id UUID NOT NULL REFERENCES public.customers(id),
  previous_outstanding NUMERIC NOT NULL DEFAULT 0,
  new_outstanding NUMERIC NOT NULL DEFAULT 0,
  outstanding_difference NUMERIC NOT NULL DEFAULT 0,
  previous_advance NUMERIC NOT NULL DEFAULT 0,
  new_advance NUMERIC NOT NULL DEFAULT 0,
  advance_difference NUMERIC NOT NULL DEFAULT 0,
  reason TEXT NOT NULL,
  adjustment_date DATE NOT NULL DEFAULT CURRENT_DATE,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.customer_balance_adjustments ENABLE ROW LEVEL SECURITY;

-- RLS policies: only org members can access
CREATE POLICY "Org members can view adjustments"
ON public.customer_balance_adjustments
FOR SELECT
USING (public.user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Org members can insert adjustments"
ON public.customer_balance_adjustments
FOR INSERT
WITH CHECK (public.user_belongs_to_org(auth.uid(), organization_id));

-- Index for performance
CREATE INDEX idx_customer_balance_adjustments_org ON public.customer_balance_adjustments(organization_id);
CREATE INDEX idx_customer_balance_adjustments_customer ON public.customer_balance_adjustments(customer_id);
