-- Update RLS policies for platform admins on organizations table
DROP POLICY IF EXISTS "users_can_select_their_organizations" ON public.organizations;
CREATE POLICY "users_can_select_their_organizations"
ON public.organizations
FOR SELECT
USING (
  has_role(auth.uid(), 'platform_admin'::app_role)
  OR id IN (
    SELECT organization_id 
    FROM organization_members 
    WHERE user_id = auth.uid()
  )
);

CREATE POLICY "platform_admins_can_create_organizations"
ON public.organizations
FOR INSERT
WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

DROP POLICY IF EXISTS "admins_can_update_organizations" ON public.organizations;
CREATE POLICY "admins_can_update_organizations"
ON public.organizations
FOR UPDATE
USING (
  has_role(auth.uid(), 'platform_admin'::app_role)
  OR EXISTS (
    SELECT 1 FROM organization_members
    WHERE organization_id = organizations.id
    AND user_id = auth.uid()
    AND role = 'admin'::app_role
  )
);

-- Platform admins can manage all organization members
CREATE POLICY "platform_admins_can_manage_all_members"
ON public.organization_members
FOR ALL
USING (has_role(auth.uid(), 'platform_admin'::app_role))
WITH CHECK (has_role(auth.uid(), 'platform_admin'::app_role));

-- Platform admins can view all user roles
DROP POLICY IF EXISTS "Admins can view all roles" ON public.user_roles;
CREATE POLICY "admins_and_platform_admins_can_view_all_roles"
ON public.user_roles
FOR SELECT
USING (
  has_role(auth.uid(), 'admin'::app_role) 
  OR has_role(auth.uid(), 'platform_admin'::app_role)
);

-- Platform admins can view all settings
CREATE POLICY "platform_admins_can_view_all_settings"
ON public.settings
FOR SELECT
USING (
  has_role(auth.uid(), 'platform_admin'::app_role)
  OR organization_id IN (SELECT get_user_organization_ids(auth.uid()))
);

-- Create function for platform admin to create organizations
CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_name TEXT,
  p_enabled_features TEXT[] DEFAULT ARRAY[]::TEXT[],
  p_admin_email TEXT DEFAULT NULL
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_org record;
  v_user_id uuid;
BEGIN
  -- Verify caller is platform admin
  IF NOT has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can create organizations';
  END IF;
  
  -- Create organization with all features on professional tier
  INSERT INTO public.organizations (name, subscription_tier, enabled_features, settings)
  VALUES (p_name, 'professional', array_to_json(p_enabled_features)::jsonb, '{}'::jsonb)
  RETURNING * INTO v_org;
  
  -- If admin email provided, add as admin (if user exists)
  IF p_admin_email IS NOT NULL THEN
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_admin_email;
    
    IF v_user_id IS NOT NULL THEN
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org.id, v_user_id, 'admin');
      
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
  
  -- Create default settings record for this organization
  INSERT INTO public.settings (organization_id)
  VALUES (v_org.id);
  
  RETURN row_to_json(v_org);
END;
$$;

-- Create function to assign user to organization
CREATE OR REPLACE FUNCTION public.platform_assign_user_to_org(
  p_user_email TEXT,
  p_org_id UUID,
  p_role app_role DEFAULT 'user'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_user_id uuid;
BEGIN
  -- Verify caller is platform admin
  IF NOT has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can assign users';
  END IF;
  
  -- Get user ID by email
  SELECT id INTO v_user_id FROM auth.users WHERE email = p_user_email;
  
  IF v_user_id IS NULL THEN
    RAISE EXCEPTION 'User not found with email: %', p_user_email;
  END IF;
  
  -- Add to organization
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (p_org_id, v_user_id, p_role)
  ON CONFLICT (organization_id, user_id) 
  DO UPDATE SET role = p_role;
  
  -- Add role to user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (v_user_id, p_role)
  ON CONFLICT (user_id, role) DO NOTHING;
  
  RETURN json_build_object(
    'success', true, 
    'user_id', v_user_id,
    'org_id', p_org_id,
    'role', p_role
  );
END;
$$;