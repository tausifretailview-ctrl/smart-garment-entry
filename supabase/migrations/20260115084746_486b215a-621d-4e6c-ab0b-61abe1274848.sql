-- Add category column to voucher_entries for expense categorization
ALTER TABLE voucher_entries ADD COLUMN IF NOT EXISTS category TEXT;

-- Create expense_categories table
CREATE TABLE IF NOT EXISTS expense_categories (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) NOT NULL,
  name TEXT NOT NULL,
  description TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(organization_id, name)
);

-- Enable RLS
ALTER TABLE expense_categories ENABLE ROW LEVEL SECURITY;

-- Create RLS policies
CREATE POLICY "Users can view expense categories in their organization"
ON expense_categories FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can create expense categories in their organization"
ON expense_categories FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update expense categories in their organization"
ON expense_categories FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete expense categories in their organization"
ON expense_categories FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  )
);

-- Insert default expense categories for all existing organizations
INSERT INTO expense_categories (organization_id, name, description, display_order)
SELECT o.id, cat.name, cat.description, cat.display_order
FROM organizations o
CROSS JOIN (VALUES
  ('Rent', 'Office or shop rent payments', 1),
  ('Salary & Wages', 'Employee salaries and wages', 2),
  ('Electricity', 'Electricity bills and charges', 3),
  ('Internet & Phone', 'Internet and telephone expenses', 4),
  ('Repairs & Maintenance', 'Equipment and premises repairs', 5),
  ('Office Expenses', 'Office supplies and stationery', 6),
  ('Marketing & Advertising', 'Promotional and advertising costs', 7),
  ('Bank Charges', 'Bank fees and transaction charges', 8),
  ('Depreciation', 'Asset depreciation expenses', 9),
  ('Miscellaneous', 'Other miscellaneous expenses', 10)
) AS cat(name, description, display_order)
ON CONFLICT (organization_id, name) DO NOTHING;

-- Create function to auto-insert default categories for new organizations
CREATE OR REPLACE FUNCTION create_default_expense_categories()
RETURNS TRIGGER AS $$
BEGIN
  INSERT INTO expense_categories (organization_id, name, description, display_order)
  VALUES
    (NEW.id, 'Rent', 'Office or shop rent payments', 1),
    (NEW.id, 'Salary & Wages', 'Employee salaries and wages', 2),
    (NEW.id, 'Electricity', 'Electricity bills and charges', 3),
    (NEW.id, 'Internet & Phone', 'Internet and telephone expenses', 4),
    (NEW.id, 'Repairs & Maintenance', 'Equipment and premises repairs', 5),
    (NEW.id, 'Office Expenses', 'Office supplies and stationery', 6),
    (NEW.id, 'Marketing & Advertising', 'Promotional and advertising costs', 7),
    (NEW.id, 'Bank Charges', 'Bank fees and transaction charges', 8),
    (NEW.id, 'Depreciation', 'Asset depreciation expenses', 9),
    (NEW.id, 'Miscellaneous', 'Other miscellaneous expenses', 10);
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Create trigger for new organizations
DROP TRIGGER IF EXISTS create_expense_categories_trigger ON organizations;
CREATE TRIGGER create_expense_categories_trigger
AFTER INSERT ON organizations
FOR EACH ROW
EXECUTE FUNCTION create_default_expense_categories();