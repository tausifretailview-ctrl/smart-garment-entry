-- Add points columns to customers table
ALTER TABLE public.customers 
ADD COLUMN IF NOT EXISTS total_points_earned numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_balance numeric DEFAULT 0,
ADD COLUMN IF NOT EXISTS points_redeemed numeric DEFAULT 0;

-- Create customer_points_history table
CREATE TABLE IF NOT EXISTS public.customer_points_history (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  customer_id uuid NOT NULL REFERENCES public.customers(id) ON DELETE CASCADE,
  sale_id uuid REFERENCES public.sales(id) ON DELETE SET NULL,
  transaction_type text NOT NULL CHECK (transaction_type IN ('earned', 'redeemed', 'adjusted', 'expired')),
  points numeric NOT NULL DEFAULT 0,
  invoice_amount numeric,
  description text,
  created_at timestamp with time zone DEFAULT now(),
  created_by uuid
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_customer_points_history_customer_id ON public.customer_points_history(customer_id);
CREATE INDEX IF NOT EXISTS idx_customer_points_history_organization_id ON public.customer_points_history(organization_id);
CREATE INDEX IF NOT EXISTS idx_customer_points_history_sale_id ON public.customer_points_history(sale_id);

-- Enable RLS
ALTER TABLE public.customer_points_history ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view points history in their organizations"
ON public.customer_points_history
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create points history in their organizations"
ON public.customer_points_history
FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins and managers can update points history"
ON public.customer_points_history
FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id) AND 
       (has_org_role(auth.uid(), organization_id, 'admin') OR 
        has_org_role(auth.uid(), organization_id, 'manager')));

CREATE POLICY "Admins can delete points history"
ON public.customer_points_history
FOR DELETE
USING (has_org_role(auth.uid(), organization_id, 'admin'));