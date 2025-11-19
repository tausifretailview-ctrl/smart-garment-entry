-- Create function to handle organization creation atomically
-- This bypasses RLS policies by using SECURITY DEFINER
CREATE OR REPLACE FUNCTION public.create_organization(
  p_name TEXT,
  p_user_id UUID DEFAULT auth.uid()
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
BEGIN
  -- 1. Create the organization
  INSERT INTO public.organizations (name, subscription_tier, enabled_features, settings)
  VALUES (p_name, 'free', '[]'::jsonb, '{}'::jsonb)
  RETURNING * INTO v_org;
  
  -- 2. Add user as admin member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org.id, p_user_id, 'admin');
  
  -- 3. Add admin role to user_roles (ignore if already exists)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- 4. Return organization data as JSON
  RETURN row_to_json(v_org);
END;
$$;