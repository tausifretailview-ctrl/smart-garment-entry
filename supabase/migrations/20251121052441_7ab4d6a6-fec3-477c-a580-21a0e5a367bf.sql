-- Add organization_number column to organizations table
ALTER TABLE public.organizations 
ADD COLUMN IF NOT EXISTS organization_number INTEGER;

-- Create a unique index to ensure no duplicate organization numbers
CREATE UNIQUE INDEX IF NOT EXISTS idx_organizations_org_number 
ON public.organizations(organization_number) 
WHERE organization_number IS NOT NULL;

-- Update existing organizations with sequential numbers (if any exist)
WITH numbered_orgs AS (
  SELECT id, ROW_NUMBER() OVER (ORDER BY created_at) as row_num
  FROM public.organizations
  WHERE organization_number IS NULL
)
UPDATE public.organizations
SET organization_number = numbered_orgs.row_num
FROM numbered_orgs
WHERE organizations.id = numbered_orgs.id;

-- Drop the old barcode generation function
DROP FUNCTION IF EXISTS public.generate_next_barcode(uuid);

-- Create updated barcode generation function that uses organization number
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org_number INTEGER;
  v_next_barcode BIGINT;
  v_starting_barcode BIGINT;
BEGIN
  -- Get organization number
  SELECT organization_number INTO v_org_number
  FROM public.organizations
  WHERE id = p_organization_id;
  
  -- If organization number is null, raise error
  IF v_org_number IS NULL THEN
    RAISE EXCEPTION 'Organization number not set for organization %', p_organization_id;
  END IF;
  
  -- Calculate starting barcode based on organization number
  -- Org 1: 10001001, Org 2: 20001001, Org 3: 30001001, etc.
  v_starting_barcode := (v_org_number * 10000000) + 1001;
  
  -- Insert or update sequence for this organization
  INSERT INTO public.barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, v_starting_barcode + 1)
  ON CONFLICT (organization_id)
  DO UPDATE SET
    next_barcode = barcode_sequence.next_barcode + 1,
    updated_at = now()
  RETURNING next_barcode - 1 INTO v_next_barcode;
  
  -- Return as text (padded to 8 digits for consistency)
  RETURN LPAD(v_next_barcode::TEXT, 8, '0');
END;
$$;

-- Update platform_create_organization to assign organization number
CREATE OR REPLACE FUNCTION public.platform_create_organization(p_name text, p_enabled_features text[] DEFAULT ARRAY[]::text[], p_admin_email text DEFAULT NULL::text)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org record;
  v_user_id uuid;
  v_next_org_number INTEGER;
BEGIN
  -- Verify caller is platform admin
  IF NOT has_role(auth.uid(), 'platform_admin'::app_role) THEN
    RAISE EXCEPTION 'Unauthorized: Only platform admins can create organizations';
  END IF;
  
  -- Get next organization number
  SELECT COALESCE(MAX(organization_number), 0) + 1 
  INTO v_next_org_number
  FROM public.organizations;
  
  -- Create organization with all features on professional tier
  INSERT INTO public.organizations (name, subscription_tier, enabled_features, settings, organization_number)
  VALUES (p_name, 'professional', array_to_json(p_enabled_features)::jsonb, '{}'::jsonb, v_next_org_number)
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

-- Update create_organization function for regular users
CREATE OR REPLACE FUNCTION public.create_organization(p_name text, p_user_id uuid DEFAULT auth.uid())
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_org record;
  v_next_org_number INTEGER;
BEGIN
  -- Get next organization number
  SELECT COALESCE(MAX(organization_number), 0) + 1 
  INTO v_next_org_number
  FROM public.organizations;
  
  -- Create the organization
  INSERT INTO public.organizations (name, subscription_tier, enabled_features, settings, organization_number)
  VALUES (p_name, 'free', '[]'::jsonb, '{}'::jsonb, v_next_org_number)
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
$$;