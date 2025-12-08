
-- Create credit_notes table
CREATE TABLE public.credit_notes (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id),
  credit_note_number TEXT NOT NULL,
  sale_id UUID REFERENCES public.sales(id),
  customer_id UUID REFERENCES public.customers(id),
  customer_name TEXT NOT NULL,
  customer_phone TEXT,
  credit_amount NUMERIC NOT NULL DEFAULT 0,
  used_amount NUMERIC NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'active',
  issue_date TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  expiry_date DATE,
  notes TEXT,
  created_by UUID,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Add columns to sales table for credit note tracking
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS credit_note_id UUID REFERENCES public.credit_notes(id);
ALTER TABLE public.sales ADD COLUMN IF NOT EXISTS credit_note_amount NUMERIC DEFAULT 0;

-- Create unique constraint on credit note number per organization
ALTER TABLE public.credit_notes ADD CONSTRAINT credit_notes_org_number_unique UNIQUE (organization_id, credit_note_number);

-- Create index for faster lookups
CREATE INDEX idx_credit_notes_organization ON public.credit_notes(organization_id);
CREATE INDEX idx_credit_notes_customer ON public.credit_notes(customer_id);
CREATE INDEX idx_credit_notes_status ON public.credit_notes(status);
CREATE INDEX idx_sales_credit_note ON public.sales(credit_note_id);

-- Enable RLS
ALTER TABLE public.credit_notes ENABLE ROW LEVEL SECURITY;

-- RLS Policies for credit_notes
CREATE POLICY "Users can view credit notes in their organizations"
ON public.credit_notes FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can create credit notes in their organizations"
ON public.credit_notes FOR INSERT
WITH CHECK (user_belongs_to_org(auth.uid(), organization_id));

CREATE POLICY "Admins and managers can update credit notes"
ON public.credit_notes FOR UPDATE
USING (user_belongs_to_org(auth.uid(), organization_id) AND 
       (has_org_role(auth.uid(), organization_id, 'admin') OR 
        has_org_role(auth.uid(), organization_id, 'manager')));

CREATE POLICY "Admins can delete credit notes"
ON public.credit_notes FOR DELETE
USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- Function to generate credit note number
CREATE OR REPLACE FUNCTION public.generate_credit_note_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  next_number INTEGER;
  financial_year TEXT;
  current_month INTEGER;
  current_year INTEGER;
  fy_start_year INTEGER;
  fy_end_year INTEGER;
  cn_num TEXT;
BEGIN
  current_month := EXTRACT(MONTH FROM CURRENT_DATE);
  current_year := EXTRACT(YEAR FROM CURRENT_DATE);
  
  IF current_month >= 4 THEN
    fy_start_year := current_year;
    fy_end_year := current_year + 1;
  ELSE
    fy_start_year := current_year - 1;
    fy_end_year := current_year;
  END IF;
  
  financial_year := SUBSTRING(fy_start_year::TEXT FROM 3 FOR 2) || '-' || SUBSTRING(fy_end_year::TEXT FROM 3 FOR 2);
  
  SELECT COALESCE(MAX(CAST(SUBSTRING(credit_note_number FROM 'CN/\d+-\d+/(\d+)$') AS INTEGER)), 0) + 1
  INTO next_number
  FROM public.credit_notes
  WHERE credit_note_number LIKE 'CN/' || financial_year || '/%'
    AND organization_id = p_organization_id;
  
  cn_num := 'CN/' || financial_year || '/' || next_number::TEXT;
  
  RETURN cn_num;
END;
$$;

-- Enable realtime for credit_notes
ALTER PUBLICATION supabase_realtime ADD TABLE public.credit_notes;
