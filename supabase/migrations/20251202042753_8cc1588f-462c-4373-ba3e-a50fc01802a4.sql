-- Create WhatsApp message templates table
CREATE TABLE IF NOT EXISTS public.whatsapp_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL, -- 'delivery_delivered', 'delivery_in_process', 'delivery_undelivered', 'sales_invoice'
  template_name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, template_type)
);

-- Enable RLS
ALTER TABLE public.whatsapp_templates ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view templates in their organizations"
  ON public.whatsapp_templates
  FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins can manage templates"
  ON public.whatsapp_templates
  FOR ALL
  USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role))
  WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- Create index for faster lookups
CREATE INDEX idx_whatsapp_templates_org_type ON public.whatsapp_templates(organization_id, template_type);

-- Add trigger for updated_at
CREATE TRIGGER update_whatsapp_templates_updated_at
  BEFORE UPDATE ON public.whatsapp_templates
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();