
-- Step 1: Assign orphan rows to first organization
UPDATE suppliers SET organization_id = (SELECT id FROM organizations LIMIT 1)
WHERE organization_id IS NULL;

UPDATE settings SET organization_id = (SELECT id FROM organizations LIMIT 1)
WHERE organization_id IS NULL;

-- Step 2: Apply NOT NULL constraints
ALTER TABLE suppliers ALTER COLUMN organization_id SET NOT NULL;
ALTER TABLE settings ALTER COLUMN organization_id SET NOT NULL;

-- Step 3: Drop stale global-role policies
DROP POLICY IF EXISTS "Admins and managers can access purchase items" ON purchase_items;
DROP POLICY IF EXISTS "Admins can delete quotation items" ON quotation_items;
