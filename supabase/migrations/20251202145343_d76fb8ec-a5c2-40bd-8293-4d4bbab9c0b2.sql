-- Create user_permissions table for granular user rights
CREATE TABLE public.user_permissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  permissions jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone DEFAULT now(),
  updated_at timestamp with time zone DEFAULT now(),
  UNIQUE(organization_id, user_id)
);

-- Enable RLS
ALTER TABLE public.user_permissions ENABLE ROW LEVEL SECURITY;

-- Only org admins can manage permissions
CREATE POLICY "Admins can manage user permissions"
ON public.user_permissions
FOR ALL
USING (has_org_role(auth.uid(), organization_id, 'admin'::app_role))
WITH CHECK (has_org_role(auth.uid(), organization_id, 'admin'::app_role));

-- Users can view their own permissions
CREATE POLICY "Users can view their own permissions"
ON public.user_permissions
FOR SELECT
USING (user_id = auth.uid());

-- Create index for faster lookups
CREATE INDEX idx_user_permissions_org_user ON public.user_permissions(organization_id, user_id);

-- Add trigger for updated_at
CREATE TRIGGER update_user_permissions_updated_at
BEFORE UPDATE ON public.user_permissions
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();