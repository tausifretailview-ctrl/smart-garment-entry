
-- Update create_organization function to include slug generation
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_user_id uuid DEFAULT auth.uid())
 RETURNS json
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_org record;
  v_next_org_number INTEGER;
  v_slug TEXT;
  v_base_slug TEXT;
  v_counter INTEGER := 0;
BEGIN
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
  
  -- Create the organization with slug
  INSERT INTO public.organizations (name, slug, subscription_tier, enabled_features, settings, organization_number)
  VALUES (p_name, v_slug, 'free', '[]'::jsonb, '{}'::jsonb, v_next_org_number)
  RETURNING * INTO v_org;
  
  -- Add user as admin member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org.id, p_user_id, 'admin');
  
  -- Add admin role to user_roles (ignore if already exists)
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;
  
  -- Return organization data as JSON
  RETURN row_to_json(v_org);
END;
$function$;
