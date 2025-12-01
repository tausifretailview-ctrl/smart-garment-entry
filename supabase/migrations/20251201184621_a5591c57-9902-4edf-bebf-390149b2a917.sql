-- Step 1: Add organization_id to batch_stock table
ALTER TABLE batch_stock 
ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Step 2: Populate organization_id from product_variants
UPDATE batch_stock bs
SET organization_id = pv.organization_id
FROM product_variants pv
WHERE bs.variant_id = pv.id;

-- Step 3: Make column NOT NULL
ALTER TABLE batch_stock 
ALTER COLUMN organization_id SET NOT NULL;

-- Step 4: Create index for batch_stock
CREATE INDEX idx_batch_stock_organization_id 
ON batch_stock(organization_id);

-- Step 5: Update RLS policies for batch_stock
DROP POLICY IF EXISTS "System can manage batch stock" ON batch_stock;
DROP POLICY IF EXISTS "Users can view batch stock in their organizations" ON batch_stock;

CREATE POLICY "Users can view batch stock in their organizations" 
ON batch_stock FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "System can manage batch stock" 
ON batch_stock FOR ALL
USING (true)
WITH CHECK (true);

-- Step 6: Add organization_id to stock_movements table
ALTER TABLE stock_movements 
ADD COLUMN organization_id uuid REFERENCES organizations(id);

-- Step 7: Populate organization_id from product_variants
UPDATE stock_movements sm
SET organization_id = pv.organization_id
FROM product_variants pv
WHERE sm.variant_id = pv.id;

-- Step 8: Make column NOT NULL
ALTER TABLE stock_movements 
ALTER COLUMN organization_id SET NOT NULL;

-- Step 9: Create index for stock_movements
CREATE INDEX idx_stock_movements_organization_id 
ON stock_movements(organization_id);

-- Step 10: Update RLS policies for stock_movements
DROP POLICY IF EXISTS "Authenticated users can insert stock movements" ON stock_movements;
DROP POLICY IF EXISTS "Authenticated users can view stock movements" ON stock_movements;

CREATE POLICY "Users can view stock movements in their organizations" 
ON stock_movements FOR SELECT
USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

CREATE POLICY "Users can insert stock movements in their organizations" 
ON stock_movements FOR INSERT
WITH CHECK (
  organization_id IN (SELECT get_user_organization_ids(auth.uid()))
);

CREATE POLICY "System can manage stock movements" 
ON stock_movements FOR ALL
USING (true)
WITH CHECK (true);