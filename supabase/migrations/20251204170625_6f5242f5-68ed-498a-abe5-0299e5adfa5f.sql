-- Update platform_create_organization function to include slug generation
CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_name text, 
  p_enabled_features text[] DEFAULT ARRAY[]::text[], 
  p_admin_email text DEFAULT NULL::text
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org record;
  v_user_id uuid;
  v_next_org_number INTEGER;
  v_slug TEXT;
  v_base_slug TEXT;
  v_counter INTEGER := 0;
BEGIN
  -- Verify caller is platform admin
  IF NOT has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can create organizations';
  END IF;
  
  -- Get next organization number
  SELECT COALESCE(MAX(organization_number), 0) + 1 
  INTO v_next_org_number
  FROM public.organizations;
  
  -- Generate base slug from name (lowercase, replace spaces with hyphens, remove special chars)
  v_base_slug := lower(regexp_replace(regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_slug := v_base_slug;
  
  -- Ensure slug is unique by appending number if needed
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;
  
  -- Create organization with slug, all features on professional tier
  INSERT INTO public.organizations (name, slug, subscription_tier, enabled_features, settings, organization_number)
  VALUES (p_name, v_slug, 'professional', array_to_json(p_enabled_features)::jsonb, '{}'::jsonb, v_next_org_number)
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