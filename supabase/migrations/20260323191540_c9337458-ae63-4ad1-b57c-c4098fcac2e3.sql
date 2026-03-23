
ALTER TABLE purchase_bills ADD COLUMN IF NOT EXISTS is_dc_purchase BOOLEAN DEFAULT FALSE;
ALTER TABLE purchase_items ADD COLUMN IF NOT EXISTS is_dc_item BOOLEAN DEFAULT FALSE;
ALTER TABLE product_variants ADD COLUMN IF NOT EXISTS is_dc_product BOOLEAN DEFAULT FALSE;
ALTER TABLE sale_items ADD COLUMN IF NOT EXISTS is_dc_item BOOLEAN DEFAULT FALSE;

CREATE TABLE IF NOT EXISTS dc_sale_transfers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  sale_id UUID REFERENCES sales(id) ON DELETE CASCADE,
  sale_item_id UUID REFERENCES sale_items(id) ON DELETE CASCADE,
  challan_id UUID REFERENCES delivery_challans(id) ON DELETE SET NULL,
  transferred_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID
);

ALTER TABLE dc_sale_transfers ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage dc_sale_transfers in their org"
ON dc_sale_transfers FOR ALL TO authenticated
USING (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()))
WITH CHECK (organization_id IN (SELECT organization_id FROM organization_members WHERE user_id = auth.uid()));

CREATE INDEX IF NOT EXISTS idx_dc_sale_transfers_sale ON dc_sale_transfers(sale_id);
CREATE INDEX IF NOT EXISTS idx_product_variants_is_dc ON product_variants(is_dc_product) WHERE is_dc_product = TRUE;
CREATE INDEX IF NOT EXISTS idx_sale_items_is_dc ON sale_items(is_dc_item) WHERE is_dc_item = TRUE;
CREATE INDEX IF NOT EXISTS idx_purchases_is_dc ON purchase_bills(is_dc_purchase) WHERE is_dc_purchase = TRUE;
