-- Create cheque_formats table for storing bank-specific cheque layouts
CREATE TABLE public.cheque_formats (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  bank_name TEXT NOT NULL,
  account_number TEXT,
  date_top_mm NUMERIC NOT NULL DEFAULT 7,
  date_left_mm NUMERIC NOT NULL DEFAULT 160,
  date_spacing_mm NUMERIC NOT NULL DEFAULT 4.5,
  date_format TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
  name_top_mm NUMERIC NOT NULL DEFAULT 20,
  name_left_mm NUMERIC NOT NULL DEFAULT 25,
  name_width_mm NUMERIC NOT NULL DEFAULT 130,
  words_top_mm NUMERIC NOT NULL DEFAULT 27,
  words_left_mm NUMERIC NOT NULL DEFAULT 35,
  words_line2_offset_mm NUMERIC NOT NULL DEFAULT 6,
  amount_top_mm NUMERIC NOT NULL DEFAULT 34,
  amount_left_mm NUMERIC NOT NULL DEFAULT 165,
  font_size_pt NUMERIC NOT NULL DEFAULT 12,
  cheque_width_mm NUMERIC NOT NULL DEFAULT 203,
  cheque_height_mm NUMERIC NOT NULL DEFAULT 89,
  show_ac_payee BOOLEAN NOT NULL DEFAULT true,
  is_default BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.cheque_formats ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view cheque formats in their organizations"
ON public.cheque_formats
FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage cheque formats"
ON public.cheque_formats
FOR ALL
USING (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role) 
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
)
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id) 
  AND (
    has_org_role(auth.uid(), organization_id, 'admin'::app_role) 
    OR has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);

-- Trigger for updated_at
CREATE TRIGGER update_cheque_formats_updated_at
BEFORE UPDATE ON public.cheque_formats
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();