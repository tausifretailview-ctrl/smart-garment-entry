-- Create import_templates table for saving field mappings
CREATE TABLE public.import_templates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES public.organizations(id) ON DELETE CASCADE NOT NULL,
  template_name TEXT NOT NULL,
  import_type TEXT NOT NULL,
  field_mappings JSONB NOT NULL DEFAULT '{}',
  excel_headers TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, template_name, import_type)
);

-- Enable RLS
ALTER TABLE public.import_templates ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can view their org templates"
ON public.import_templates FOR SELECT
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "Users can insert their org templates"
ON public.import_templates FOR INSERT
WITH CHECK (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "Users can update their org templates"
ON public.import_templates FOR UPDATE
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

CREATE POLICY "Users can delete their org templates"
ON public.import_templates FOR DELETE
USING (organization_id IN (
  SELECT organization_id FROM public.organization_members 
  WHERE user_id = auth.uid()
));

-- Add trigger for updated_at
CREATE TRIGGER update_import_templates_updated_at
BEFORE UPDATE ON public.import_templates
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();