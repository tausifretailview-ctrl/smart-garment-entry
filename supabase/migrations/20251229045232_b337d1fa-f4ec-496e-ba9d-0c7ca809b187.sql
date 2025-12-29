-- Create sms_settings table for storing SMS provider configuration
CREATE TABLE public.sms_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'msg91',
  sender_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id)
);

-- Create sms_templates table for storing SMS message templates
CREATE TABLE public.sms_templates (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_type TEXT NOT NULL,
  template_name TEXT NOT NULL,
  message_template TEXT NOT NULL,
  dlt_template_id TEXT,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  UNIQUE(organization_id, template_type)
);

-- Create sms_logs table for tracking sent SMS
CREATE TABLE public.sms_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  template_type TEXT,
  phone_number TEXT NOT NULL,
  message TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  provider_response JSONB,
  reference_id UUID,
  reference_type TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS on all tables
ALTER TABLE public.sms_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_templates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sms_logs ENABLE ROW LEVEL SECURITY;

-- RLS Policies for sms_settings
CREATE POLICY "Admins can manage SMS settings"
ON public.sms_settings
FOR ALL
USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE POLICY "Users can view SMS settings in their organizations"
ON public.sms_settings
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- RLS Policies for sms_templates
CREATE POLICY "Admins can manage SMS templates"
ON public.sms_templates
FOR ALL
USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

CREATE POLICY "Users can view SMS templates in their organizations"
ON public.sms_templates
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- RLS Policies for sms_logs
CREATE POLICY "Users can create SMS logs in their organizations"
ON public.sms_logs
FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can view SMS logs in their organizations"
ON public.sms_logs
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Create indexes for better query performance
CREATE INDEX idx_sms_templates_org_type ON public.sms_templates(organization_id, template_type);
CREATE INDEX idx_sms_logs_org_created ON public.sms_logs(organization_id, created_at DESC);
CREATE INDEX idx_sms_logs_reference ON public.sms_logs(reference_type, reference_id);