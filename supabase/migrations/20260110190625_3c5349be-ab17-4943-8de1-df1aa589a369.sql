-- Create whatsapp_api_settings table for organization WhatsApp Business API configuration
CREATE TABLE public.whatsapp_api_settings (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  provider TEXT NOT NULL DEFAULT 'meta_cloud_api',
  phone_number_id TEXT,
  waba_id TEXT,
  access_token TEXT,
  business_name TEXT,
  is_active BOOLEAN NOT NULL DEFAULT false,
  auto_send_invoice BOOLEAN NOT NULL DEFAULT false,
  auto_send_quotation BOOLEAN NOT NULL DEFAULT false,
  auto_send_sale_order BOOLEAN NOT NULL DEFAULT false,
  auto_send_payment_reminder BOOLEAN NOT NULL DEFAULT false,
  webhook_verify_token TEXT,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id)
);

-- Create whatsapp_logs table for message tracking
CREATE TABLE public.whatsapp_logs (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  phone_number TEXT NOT NULL,
  message TEXT,
  template_name TEXT,
  template_type TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending',
  wamid TEXT,
  reference_id UUID,
  reference_type TEXT,
  provider_response JSONB,
  error_message TEXT,
  sent_at TIMESTAMP WITH TIME ZONE,
  delivered_at TIMESTAMP WITH TIME ZONE,
  read_at TIMESTAMP WITH TIME ZONE,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.whatsapp_api_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.whatsapp_logs ENABLE ROW LEVEL SECURITY;

-- RLS policies for whatsapp_api_settings
CREATE POLICY "Users can view their organization whatsapp settings"
ON public.whatsapp_api_settings
FOR SELECT
USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can insert their organization whatsapp settings"
ON public.whatsapp_api_settings
FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can update their organization whatsapp settings"
ON public.whatsapp_api_settings
FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can delete their organization whatsapp settings"
ON public.whatsapp_api_settings
FOR DELETE
USING (user_belongs_to_org(auth.uid(), organization_id));

-- RLS policies for whatsapp_logs
CREATE POLICY "Users can view their organization whatsapp logs"
ON public.whatsapp_logs
FOR SELECT
USING (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can insert their organization whatsapp logs"
ON public.whatsapp_logs
FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Users can update their organization whatsapp logs"
ON public.whatsapp_logs
FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id));

-- Create indexes for efficient querying
CREATE INDEX idx_whatsapp_logs_organization_id ON public.whatsapp_logs(organization_id);
CREATE INDEX idx_whatsapp_logs_status ON public.whatsapp_logs(status);
CREATE INDEX idx_whatsapp_logs_created_at ON public.whatsapp_logs(created_at DESC);
CREATE INDEX idx_whatsapp_logs_reference ON public.whatsapp_logs(reference_id, reference_type);

-- Create trigger to update updated_at
CREATE TRIGGER update_whatsapp_api_settings_updated_at
BEFORE UPDATE ON public.whatsapp_api_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();