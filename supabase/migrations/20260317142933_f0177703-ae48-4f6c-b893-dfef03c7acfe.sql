
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id uuid)
 RETURNS text
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_num BIGINT;
  v_barcode TEXT;
  v_exists BOOLEAN;
  v_min_digits INTEGER;
  v_digits INTEGER;
  v_max_val BIGINT;
  v_org_number INTEGER;
  v_starting_barcode BIGINT;
BEGIN
  -- Get configured minimum digits (default 8)
  SELECT COALESCE(
    ((bill_barcode_settings::jsonb)->>'barcode_digits')::integer,
    8
  )
  INTO v_min_digits
  FROM settings
  WHERE organization_id = p_organization_id;

  -- If no settings row, default to 8
  IF v_min_digits IS NULL THEN
    v_min_digits := 8;
  END IF;

  -- Clamp between 8 and 13
  IF v_min_digits < 8 THEN v_min_digits := 8; END IF;
  IF v_min_digits > 13 THEN v_min_digits := 13; END IF;

  -- Compute proper starting barcode from organization_number
  SELECT COALESCE(organization_number, 1) INTO v_org_number
  FROM organizations WHERE id = p_organization_id;

  v_starting_barcode := (v_org_number::bigint * 10000000) + 1001;

  -- Upsert sequence with org-prefixed starting value
  INSERT INTO barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, v_starting_barcode)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Get and increment
  UPDATE barcode_sequence
  SET next_barcode = next_barcode + 1, updated_at = now()
  WHERE organization_id = p_organization_id
  RETURNING next_barcode - 1 INTO v_num;

  -- Auto-scale: determine how many digits are needed
  v_digits := v_min_digits;
  v_max_val := (10::bigint ^ v_digits) - 1;

  -- If number exceeds current digit capacity, scale up (max 13)
  WHILE v_num > v_max_val AND v_digits < 13 LOOP
    v_digits := v_digits + 1;
    v_max_val := (10::bigint ^ v_digits) - 1;
  END LOOP;

  v_barcode := LPAD(v_num::TEXT, v_digits, '0');

  -- Collision check
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode AND organization_id = p_organization_id
  ) LOOP
    v_num := v_num + 1;
    -- Re-check digit scaling for the new number
    WHILE v_num > (10::bigint ^ v_digits) - 1 AND v_digits < 13 LOOP
      v_digits := v_digits + 1;
    END LOOP;
    v_barcode := LPAD(v_num::TEXT, v_digits, '0');
  END LOOP;

  -- Update sequence to reflect actual next value
  UPDATE barcode_sequence
  SET next_barcode = v_num + 1, updated_at = now()
  WHERE organization_id = p_organization_id;

  RETURN v_barcode;
END;
$function$;

-- Also update create_organization to initialize barcode_sequence immediately
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
  v_starting_barcode BIGINT;
BEGIN
  -- Get next organization number
  SELECT COALESCE(MAX(organization_number), 0) + 1
  INTO v_next_org_number
  FROM public.organizations;

  -- Generate base slug from name
  v_base_slug := lower(regexp_replace(regexp_replace(p_name, '[^a-zA-Z0-9\s-]', '', 'g'), '\s+', '-', 'g'));
  v_slug := v_base_slug;

  -- Ensure slug is unique
  WHILE EXISTS (SELECT 1 FROM public.organizations WHERE slug = v_slug) LOOP
    v_counter := v_counter + 1;
    v_slug := v_base_slug || '-' || v_counter;
  END LOOP;

  -- Create the organization with slug
  INSERT INTO public.organizations (name, slug, subscription_tier, enabled_features, settings, organization_number)
  VALUES (p_name, v_slug, 'free', '[]'::jsonb, '{}'::jsonb, v_next_org_number)
  RETURNING * INTO v_org;

  -- Initialize barcode_sequence with org-prefixed starting value
  v_starting_barcode := (v_next_org_number::bigint * 10000000) + 1001;
  INSERT INTO barcode_sequence (organization_id, next_barcode)
  VALUES (v_org.id, v_starting_barcode)
  ON CONFLICT (organization_id) DO NOTHING;

  -- Add user as admin member
  INSERT INTO public.organization_members (organization_id, user_id, role)
  VALUES (v_org.id, p_user_id, 'admin');

  -- Add admin role to user_roles
  INSERT INTO public.user_roles (user_id, role)
  VALUES (p_user_id, 'admin')
  ON CONFLICT (user_id, role) DO NOTHING;

  -- Return organization data as JSON
  RETURN row_to_json(v_org);
END;
$function$;
