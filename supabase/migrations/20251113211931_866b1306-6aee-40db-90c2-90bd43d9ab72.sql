-- Create settings table for application configuration
CREATE TABLE public.settings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  business_name text,
  address text,
  mobile_number text,
  email_id text,
  gst_number text,
  product_settings jsonb DEFAULT '{}'::jsonb,
  purchase_settings jsonb DEFAULT '{}'::jsonb,
  sale_settings jsonb DEFAULT '{}'::jsonb,
  bill_barcode_settings jsonb DEFAULT '{}'::jsonb,
  report_settings jsonb DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.settings ENABLE ROW LEVEL SECURITY;

-- Create policies - only authenticated users can view/edit settings
CREATE POLICY "Authenticated users can view settings"
ON public.settings
FOR SELECT
TO authenticated
USING (true);

CREATE POLICY "Admins can update settings"
ON public.settings
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Admins can insert settings"
ON public.settings
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Create trigger for automatic timestamp updates
CREATE TRIGGER update_settings_updated_at
BEFORE UPDATE ON public.settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Insert default settings row (singleton pattern)
INSERT INTO public.settings (id) VALUES ('00000000-0000-0000-0000-000000000001');