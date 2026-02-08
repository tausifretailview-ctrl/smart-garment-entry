-- Update the platform_create_organization function to accept organization_type parameter
CREATE OR REPLACE FUNCTION public.platform_create_organization(
  p_name text,
  p_enabled_features text[] DEFAULT ARRAY[]::text[],
  p_admin_email text DEFAULT NULL::text,
  p_organization_type text DEFAULT 'business'
)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_org_id uuid;
  v_user_id uuid;
  v_slug text;
  v_next_org_number integer;
BEGIN
  -- Generate slug from name
  v_slug := lower(regexp_replace(p_name, '[^a-zA-Z0-9]+', '-', 'g'));
  v_slug := regexp_replace(v_slug, '^-|-$', '', 'g');
  
  -- Ensure unique slug by appending random suffix if needed
  IF EXISTS (SELECT 1 FROM organizations WHERE slug = v_slug) THEN
    v_slug := v_slug || '-' || substring(gen_random_uuid()::text from 1 for 6);
  END IF;
  
  -- Get the next organization number
  SELECT COALESCE(MAX(organization_number), 0) + 1 INTO v_next_org_number FROM organizations;
  
  -- Create the organization with organization_type
  INSERT INTO public.organizations (
    name, slug, subscription_tier, enabled_features, settings, organization_number, organization_type
  )
  VALUES (
    p_name, v_slug, 'professional', array_to_json(p_enabled_features)::jsonb, '{}'::jsonb, v_next_org_number, p_organization_type
  )
  RETURNING id INTO v_org_id;
  
  -- If admin email provided, assign that user as admin
  IF p_admin_email IS NOT NULL THEN
    -- Find user by email
    SELECT id INTO v_user_id FROM auth.users WHERE email = p_admin_email;
    
    IF v_user_id IS NOT NULL THEN
      -- Add user to organization as admin
      INSERT INTO public.organization_members (organization_id, user_id, role)
      VALUES (v_org_id, v_user_id, 'admin')
      ON CONFLICT (organization_id, user_id) DO UPDATE SET role = 'admin';
      
      -- Create user role entry
      INSERT INTO public.user_roles (user_id, role)
      VALUES (v_user_id, 'admin')
      ON CONFLICT (user_id, role) DO NOTHING;
    END IF;
  END IF;
  
  RETURN json_build_object(
    'id', v_org_id,
    'name', p_name,
    'slug', v_slug,
    'organization_number', v_next_org_number,
    'organization_type', p_organization_type
  );
END;
$function$;