-- Create a backup table for organization label designs
CREATE TABLE public.organization_label_templates_backup (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  organization_name TEXT NOT NULL,
  template_name TEXT NOT NULL,
  template_config JSONB NOT NULL,
  description TEXT,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  UNIQUE(organization_id, template_name)
);

-- Enable RLS
ALTER TABLE public.organization_label_templates_backup ENABLE ROW LEVEL SECURITY;

-- Create policy for organization members to view their templates
CREATE POLICY "Organization members can view their label backups"
ON public.organization_label_templates_backup
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid()
  )
);

-- Create policy for admins to manage label backups
CREATE POLICY "Admins can manage label backups"
ON public.organization_label_templates_backup
FOR ALL
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- Add index for faster lookups
CREATE INDEX idx_label_backup_org_id ON public.organization_label_templates_backup(organization_id);
CREATE INDEX idx_label_backup_template_name ON public.organization_label_templates_backup(template_name);

-- Create updated_at trigger
CREATE TRIGGER update_organization_label_templates_backup_updated_at
BEFORE UPDATE ON public.organization_label_templates_backup
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();