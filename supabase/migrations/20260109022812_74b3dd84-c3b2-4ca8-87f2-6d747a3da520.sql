-- Create payment_gateway_settings table to store gateway configuration per organization
CREATE TABLE public.payment_gateway_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  active_gateway TEXT NOT NULL DEFAULT 'upi_link', -- 'upi_link' | 'razorpay' | 'phonepe'
  upi_id TEXT,
  upi_business_name TEXT,
  razorpay_key_id TEXT,
  razorpay_enabled BOOLEAN DEFAULT FALSE,
  phonepe_merchant_id TEXT,
  phonepe_enabled BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id)
);

-- Create payment_links table to track generated payment links and their status
CREATE TABLE public.payment_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES public.sales(id),
  legacy_invoice_id UUID REFERENCES public.legacy_invoices(id),
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  invoice_number TEXT,
  amount DECIMAL(12,2) NOT NULL,
  gateway TEXT NOT NULL, -- 'upi_link' | 'razorpay' | 'phonepe'
  gateway_link_id TEXT, -- Razorpay/PhonePe link ID
  payment_url TEXT,
  status TEXT NOT NULL DEFAULT 'created', -- created, sent, paid, expired, cancelled
  paid_at TIMESTAMPTZ,
  gateway_payment_id TEXT, -- Payment ID from gateway
  created_by UUID,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.payment_gateway_settings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payment_links ENABLE ROW LEVEL SECURITY;

-- RLS policies for payment_gateway_settings
CREATE POLICY "Users can view gateway settings in their organizations"
ON public.payment_gateway_settings FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins can manage gateway settings"
ON public.payment_gateway_settings FOR ALL
USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- RLS policies for payment_links
CREATE POLICY "Users can view payment links in their organizations"
ON public.payment_links FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create payment links in their organizations"
ON public.payment_links FOR INSERT
WITH CHECK (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can update payment links in their organizations"
ON public.payment_links FOR UPDATE
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Create updated_at trigger for payment_gateway_settings
CREATE TRIGGER update_payment_gateway_settings_updated_at
BEFORE UPDATE ON public.payment_gateway_settings
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();

-- Create updated_at trigger for payment_links
CREATE TRIGGER update_payment_links_updated_at
BEFORE UPDATE ON public.payment_links
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();