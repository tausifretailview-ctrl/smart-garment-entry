-- Create legacy_invoices table for historical billing data from external systems
CREATE TABLE public.legacy_invoices (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id UUID REFERENCES public.customers(id) ON DELETE SET NULL,
  customer_name TEXT NOT NULL,
  invoice_number TEXT NOT NULL,
  invoice_date DATE NOT NULL,
  amount NUMERIC NOT NULL DEFAULT 0,
  payment_status TEXT NOT NULL DEFAULT 'Paid',
  source TEXT DEFAULT 'Odoo ERP',
  notes TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Create indexes for better query performance
CREATE INDEX idx_legacy_invoices_org ON public.legacy_invoices(organization_id);
CREATE INDEX idx_legacy_invoices_customer ON public.legacy_invoices(customer_id);
CREATE INDEX idx_legacy_invoices_customer_name ON public.legacy_invoices(customer_name);
CREATE INDEX idx_legacy_invoices_invoice_number ON public.legacy_invoices(organization_id, invoice_number);

-- Add unique constraint to prevent duplicate imports
ALTER TABLE public.legacy_invoices ADD CONSTRAINT legacy_invoices_unique_invoice 
  UNIQUE (organization_id, invoice_number);

-- Enable RLS
ALTER TABLE public.legacy_invoices ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view legacy invoices in their organizations"
  ON public.legacy_invoices FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage legacy invoices"
  ON public.legacy_invoices FOR ALL
  USING (
    user_belongs_to_org(auth.uid(), organization_id) AND 
    (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
     has_org_role(auth.uid(), organization_id, 'manager'::app_role))
  )
  WITH CHECK (
    user_belongs_to_org(auth.uid(), organization_id) AND 
    (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
     has_org_role(auth.uid(), organization_id, 'manager'::app_role))
  );