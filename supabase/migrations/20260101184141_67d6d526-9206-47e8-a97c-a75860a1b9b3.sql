-- Create table for storing customer brand-wise discounts
CREATE TABLE public.customer_brand_discounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  brand TEXT NOT NULL,
  discount_percent NUMERIC NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(customer_id, brand)
);

-- Enable Row Level Security
ALTER TABLE public.customer_brand_discounts ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view brand discounts in their organizations
CREATE POLICY "Users can view brand discounts in their org"
ON public.customer_brand_discounts
FOR SELECT
TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Policy: Users can insert brand discounts in their organizations
CREATE POLICY "Users can insert brand discounts in their org"
ON public.customer_brand_discounts
FOR INSERT
TO authenticated
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Policy: Users can update brand discounts in their organizations
CREATE POLICY "Users can update brand discounts in their org"
ON public.customer_brand_discounts
FOR UPDATE
TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Policy: Users can delete brand discounts in their organizations
CREATE POLICY "Users can delete brand discounts in their org"
ON public.customer_brand_discounts
FOR DELETE
TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Create index for faster lookups
CREATE INDEX idx_customer_brand_discounts_customer_id ON public.customer_brand_discounts(customer_id);
CREATE INDEX idx_customer_brand_discounts_org_id ON public.customer_brand_discounts(organization_id);