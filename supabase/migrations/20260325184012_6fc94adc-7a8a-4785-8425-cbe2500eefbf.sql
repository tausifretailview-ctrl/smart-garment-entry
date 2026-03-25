
CREATE TABLE public.sale_financer_details (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id UUID NOT NULL REFERENCES public.sales(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  financer_name TEXT NOT NULL,
  loan_number TEXT,
  emi_amount NUMERIC(15,2) DEFAULT 0,
  tenure INTEGER,
  down_payment NUMERIC(15,2) DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

ALTER TABLE public.sale_financer_details ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view financer details for their org"
ON public.sale_financer_details FOR SELECT TO authenticated
USING (organization_id IN (
  SELECT id FROM public.organizations WHERE id = organization_id
));

CREATE POLICY "Users can insert financer details for their org"
ON public.sale_financer_details FOR INSERT TO authenticated
WITH CHECK (organization_id IN (
  SELECT id FROM public.organizations WHERE id = organization_id
));

CREATE POLICY "Users can update financer details for their org"
ON public.sale_financer_details FOR UPDATE TO authenticated
USING (organization_id IN (
  SELECT id FROM public.organizations WHERE id = organization_id
));

CREATE POLICY "Users can delete financer details for their org"
ON public.sale_financer_details FOR DELETE TO authenticated
USING (organization_id IN (
  SELECT id FROM public.organizations WHERE id = organization_id
));

CREATE INDEX idx_sale_financer_details_sale_id ON public.sale_financer_details(sale_id);
CREATE INDEX idx_sale_financer_details_org_id ON public.sale_financer_details(organization_id);
