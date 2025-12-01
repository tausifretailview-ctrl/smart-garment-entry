-- Step 1: Add organization_id column (nullable initially)
ALTER TABLE product_variants 
ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Step 2: Populate organization_id from products table
UPDATE product_variants pv
SET organization_id = p.organization_id
FROM products p
WHERE pv.product_id = p.id;

-- Step 3: Make column NOT NULL after data is populated
ALTER TABLE product_variants 
ALTER COLUMN organization_id SET NOT NULL;

-- Step 4: Create index for faster filtering
CREATE INDEX idx_product_variants_organization_id 
ON product_variants(organization_id);

-- Step 5: Drop existing RLS policies
DROP POLICY IF EXISTS "Users can view variants in their organizations" ON product_variants;
DROP POLICY IF EXISTS "Admins and managers can manage variants" ON product_variants;

-- Step 6: Create new simplified RLS policies using direct organization_id
CREATE POLICY "Users can view variants in their organizations" 
ON product_variants FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Admins and managers can manage variants" 
ON product_variants FOR ALL
USING (
  user_belongs_to_org(auth.uid(), organization_id) AND
  (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
   has_org_role(auth.uid(), organization_id, 'manager'::app_role))
)
WITH CHECK (
  user_belongs_to_org(auth.uid(), organization_id) AND
  (has_org_role(auth.uid(), organization_id, 'admin'::app_role) OR 
   has_org_role(auth.uid(), organization_id, 'manager'::app_role))
);