-- Add unique constraint on (organization_id, group_name) to prevent duplicates within an organization
-- First drop any existing unique constraint on group_name alone
ALTER TABLE size_groups DROP CONSTRAINT IF EXISTS size_groups_group_name_key;

-- Add the new organization-scoped unique constraint
ALTER TABLE size_groups ADD CONSTRAINT size_groups_org_group_name_unique 
  UNIQUE (organization_id, group_name);

-- Also make organization_id NOT NULL to prevent future NULL values
ALTER TABLE size_groups ALTER COLUMN organization_id SET NOT NULL;