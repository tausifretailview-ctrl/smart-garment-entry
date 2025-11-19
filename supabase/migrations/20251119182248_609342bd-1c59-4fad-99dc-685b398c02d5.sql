-- Backfill organization_id for existing sequence records
-- This assigns existing records to the first/oldest organization

DO $$
DECLARE
  default_org_id uuid;
BEGIN
  -- Get the first organization (oldest by created_at)
  SELECT id INTO default_org_id
  FROM public.organizations
  ORDER BY created_at ASC
  LIMIT 1;

  -- Only proceed if we found an organization
  IF default_org_id IS NOT NULL THEN
    -- Update bill_number_sequence records with NULL organization_id
    UPDATE public.bill_number_sequence
    SET organization_id = default_org_id
    WHERE organization_id IS NULL;

    -- Update barcode_sequence records with NULL organization_id
    UPDATE public.barcode_sequence
    SET organization_id = default_org_id
    WHERE organization_id IS NULL;

    RAISE NOTICE 'Backfilled organization_id for sequence tables with organization: %', default_org_id;
  ELSE
    RAISE NOTICE 'No organizations found - skipping backfill';
  END IF;
END $$;