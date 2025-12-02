-- Add delivery_status column to sales table
ALTER TABLE public.sales 
ADD COLUMN delivery_status text DEFAULT 'undelivered';

-- Create delivery_tracking table for status history
CREATE TABLE public.delivery_tracking (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  sale_id uuid NOT NULL REFERENCES sales(id) ON DELETE CASCADE,
  organization_id uuid NOT NULL REFERENCES organizations(id),
  status text NOT NULL,
  status_date date NOT NULL DEFAULT CURRENT_DATE,
  narration text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

-- Create index for faster queries
CREATE INDEX idx_delivery_tracking_sale_id ON public.delivery_tracking(sale_id);
CREATE INDEX idx_delivery_tracking_organization_id ON public.delivery_tracking(organization_id);

-- Enable RLS
ALTER TABLE public.delivery_tracking ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view delivery tracking in their organizations"
ON delivery_tracking FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage delivery tracking"
ON delivery_tracking FOR ALL
USING (user_belongs_to_org(auth.uid(), organization_id) 
  AND (has_org_role(auth.uid(), organization_id, 'admin'::app_role) 
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)))
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id) 
  AND (has_org_role(auth.uid(), organization_id, 'admin'::app_role) 
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)));