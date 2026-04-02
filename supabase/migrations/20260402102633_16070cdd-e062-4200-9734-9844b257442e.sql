CREATE TABLE IF NOT EXISTS student_balance_audit (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id uuid NOT NULL REFERENCES organizations(id),
  student_id uuid NOT NULL REFERENCES students(id),
  adjusted_by uuid,
  adjusted_by_name text,
  adjustment_type text NOT NULL,
  old_balance numeric NOT NULL DEFAULT 0,
  new_balance numeric NOT NULL DEFAULT 0,
  change_amount numeric NOT NULL DEFAULT 0,
  reason_code text NOT NULL,
  reason_code_label text,
  reason_detail text,
  voucher_number text NOT NULL,
  academic_year_id uuid REFERENCES academic_years(id),
  created_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_student_balance_audit_student ON student_balance_audit(student_id);
CREATE INDEX IF NOT EXISTS idx_student_balance_audit_org ON student_balance_audit(organization_id);

ALTER TABLE student_balance_audit ENABLE ROW LEVEL SECURITY;
CREATE POLICY "org_student_balance_audit" ON student_balance_audit
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));