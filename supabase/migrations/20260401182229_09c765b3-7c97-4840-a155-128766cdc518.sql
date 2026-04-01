
-- 1. Add commission_percent default to employees
ALTER TABLE employees
  ADD COLUMN IF NOT EXISTS commission_percent numeric DEFAULT 1.0 NOT NULL;

-- 2. Commission rules — per salesman, per scope
CREATE TABLE IF NOT EXISTS commission_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid NOT NULL REFERENCES employees(id),
  employee_name text NOT NULL,
  rule_type text NOT NULL DEFAULT 'default',
  rule_value text,
  commission_percent numeric NOT NULL DEFAULT 1.0,
  is_active boolean DEFAULT true,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- 3. Commission transactions — auto-created on each sale
CREATE TABLE IF NOT EXISTS salesman_commissions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  employee_id uuid REFERENCES employees(id),
  employee_name text NOT NULL,
  sale_id uuid REFERENCES sales(id),
  sale_number text NOT NULL,
  sale_date date NOT NULL,
  customer_name text,
  product_id text,
  product_name text,
  brand text,
  category text,
  style text,
  sale_amount numeric NOT NULL DEFAULT 0,
  commission_percent numeric NOT NULL DEFAULT 1.0,
  commission_amount numeric NOT NULL DEFAULT 0,
  rule_type text DEFAULT 'default',
  payment_status text DEFAULT 'pending',
  paid_date date,
  paid_voucher_id uuid,
  notes text,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_commission_rules_org ON commission_rules(organization_id);
CREATE INDEX IF NOT EXISTS idx_commission_rules_employee ON commission_rules(employee_id);
CREATE INDEX IF NOT EXISTS idx_salesman_commissions_org ON salesman_commissions(organization_id);
CREATE INDEX IF NOT EXISTS idx_salesman_commissions_employee ON salesman_commissions(employee_id);
CREATE INDEX IF NOT EXISTS idx_salesman_commissions_sale ON salesman_commissions(sale_id);
CREATE INDEX IF NOT EXISTS idx_salesman_commissions_date ON salesman_commissions(sale_date);
CREATE INDEX IF NOT EXISTS idx_salesman_commissions_status ON salesman_commissions(payment_status);

-- RLS
ALTER TABLE commission_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE salesman_commissions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "org_commission_rules" ON commission_rules
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_salesman_commissions" ON salesman_commissions
  FOR ALL USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));
