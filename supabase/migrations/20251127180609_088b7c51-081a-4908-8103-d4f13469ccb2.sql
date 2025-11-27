-- Create table for organization-wide barcode label settings
CREATE TABLE public.barcode_label_settings (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  setting_type text NOT NULL, -- 'sheet_type', 'label_template', 'margin_preset', 'default_format'
  setting_name text NOT NULL,
  setting_data jsonb NOT NULL DEFAULT '{}'::jsonb,
  is_default boolean DEFAULT false,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  created_by uuid REFERENCES auth.users(id),
  UNIQUE(organization_id, setting_type, setting_name)
);

-- Enable RLS
ALTER TABLE public.barcode_label_settings ENABLE ROW LEVEL SECURITY;

-- Policy: Users can view settings in their organizations
CREATE POLICY "Users can view barcode settings in their organizations"
ON public.barcode_label_settings
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Policy: Admins and managers can manage settings
CREATE POLICY "Admins and managers can manage barcode settings"
ON public.barcode_label_settings
FOR ALL
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

-- Create trigger for updated_at
CREATE TRIGGER update_barcode_label_settings_updated_at
BEFORE UPDATE ON public.barcode_label_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();