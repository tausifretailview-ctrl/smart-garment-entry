-- Create platform_settings table for storing default WhatsApp API credentials
CREATE TABLE public.platform_settings (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  setting_key TEXT UNIQUE NOT NULL,
  setting_value JSONB,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.platform_settings ENABLE ROW LEVEL SECURITY;

-- Only platform admins can view/modify platform settings
CREATE POLICY "Platform admins can view platform settings"
ON public.platform_settings
FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role = 'platform_admin'
  )
);

CREATE POLICY "Platform admins can modify platform settings"
ON public.platform_settings
FOR ALL
USING (
  EXISTS (
    SELECT 1 FROM organization_members om
    WHERE om.user_id = auth.uid()
    AND om.role = 'platform_admin'
  )
);

-- Insert default WhatsApp API settings placeholder
INSERT INTO public.platform_settings (setting_key, setting_value) VALUES (
  'default_whatsapp_api',
  '{
    "phone_number_id": "",
    "waba_id": "",
    "access_token": "",
    "business_name": "Platform WhatsApp"
  }'::jsonb
);

-- Add use_default_api column to whatsapp_api_settings
ALTER TABLE public.whatsapp_api_settings 
ADD COLUMN IF NOT EXISTS use_default_api BOOLEAN DEFAULT true;

-- Create trigger for updated_at
CREATE OR REPLACE FUNCTION public.update_platform_settings_updated_at()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

CREATE TRIGGER update_platform_settings_updated_at
BEFORE UPDATE ON public.platform_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_platform_settings_updated_at();