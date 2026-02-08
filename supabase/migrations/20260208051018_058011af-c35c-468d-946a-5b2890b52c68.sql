-- Phase 1: School Module Database Schema (Fixed)
-- =============================================

-- 1.1 Add organization_type column to organizations
ALTER TABLE organizations 
ADD COLUMN IF NOT EXISTS organization_type TEXT NOT NULL DEFAULT 'business';

-- Add check constraint for valid types (using a trigger for safety)
CREATE OR REPLACE FUNCTION check_organization_type()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.organization_type NOT IN ('business', 'school') THEN
    RAISE EXCEPTION 'Invalid organization_type. Must be business or school.';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS validate_organization_type ON organizations;
CREATE TRIGGER validate_organization_type
  BEFORE INSERT OR UPDATE ON organizations
  FOR EACH ROW
  EXECUTE FUNCTION check_organization_type();

-- Add index for filtering by type
CREATE INDEX IF NOT EXISTS idx_organizations_type ON organizations(organization_type);

-- 1.2 Academic years table
CREATE TABLE IF NOT EXISTS academic_years (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  year_name TEXT NOT NULL,
  start_date DATE NOT NULL,
  end_date DATE NOT NULL,
  is_current BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, year_name)
);

-- Classes/Standards table (section can be NULL, use separate unique index)
CREATE TABLE IF NOT EXISTS school_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  section TEXT DEFAULT '',
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, class_name, section)
);

-- 1.3 Students table
CREATE TABLE IF NOT EXISTS students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  admission_number TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_id UUID REFERENCES school_classes(id),
  academic_year_id UUID REFERENCES academic_years(id),
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  parent_name TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  parent_relation TEXT,
  emergency_contact TEXT,
  customer_id UUID REFERENCES customers(id),
  user_id UUID,
  status TEXT DEFAULT 'active',
  admission_date DATE DEFAULT CURRENT_DATE,
  photo_url TEXT,
  notes TEXT,
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, admission_number)
);

-- 1.4 Teachers table
CREATE TABLE IF NOT EXISTS teachers (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  employee_id UUID REFERENCES employees(id),
  teacher_code TEXT NOT NULL,
  teacher_name TEXT NOT NULL,
  subjects TEXT[],
  phone TEXT,
  email TEXT,
  qualification TEXT,
  date_of_joining DATE,
  user_id UUID,
  can_view_students BOOLEAN DEFAULT true,
  can_view_fees BOOLEAN DEFAULT false,
  status TEXT DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, teacher_code)
);

-- 1.5 Fee Management Tables
CREATE TABLE IF NOT EXISTS fee_heads (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  head_name TEXT NOT NULL,
  description TEXT,
  is_refundable BOOLEAN DEFAULT false,
  is_active BOOLEAN DEFAULT true,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, head_name)
);

CREATE TABLE IF NOT EXISTS fee_structures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  class_id UUID NOT NULL REFERENCES school_classes(id),
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  amount DECIMAL(12,2) NOT NULL,
  frequency TEXT NOT NULL DEFAULT 'monthly',
  due_day INTEGER DEFAULT 10,
  late_fee_amount DECIMAL(10,2) DEFAULT 0,
  late_fee_after_days INTEGER DEFAULT 15,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(academic_year_id, class_id, fee_head_id)
);

CREATE TABLE IF NOT EXISTS fee_schedules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  class_id UUID REFERENCES school_classes(id),
  fee_head_id UUID REFERENCES fee_heads(id),
  due_date DATE NOT NULL,
  period_name TEXT,
  period_start DATE,
  period_end DATE,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS student_fees (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  student_id UUID NOT NULL REFERENCES students(id),
  fee_structure_id UUID REFERENCES fee_structures(id),
  fee_head_id UUID NOT NULL REFERENCES fee_heads(id),
  academic_year_id UUID NOT NULL REFERENCES academic_years(id),
  period_month INTEGER,
  period_year INTEGER,
  amount DECIMAL(12,2) NOT NULL,
  late_fee DECIMAL(10,2) DEFAULT 0,
  discount DECIMAL(10,2) DEFAULT 0,
  discount_reason TEXT,
  due_date DATE,
  status TEXT DEFAULT 'pending',
  payment_id UUID,
  payment_receipt_id UUID,
  sale_id UUID REFERENCES sales(id),
  paid_amount DECIMAL(12,2) DEFAULT 0,
  paid_date DATE,
  payment_method TEXT,
  transaction_id TEXT,
  notes TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for performance
CREATE INDEX IF NOT EXISTS idx_academic_years_org ON academic_years(organization_id);
CREATE INDEX IF NOT EXISTS idx_school_classes_org ON school_classes(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_org ON students(organization_id);
CREATE INDEX IF NOT EXISTS idx_students_class ON students(class_id);
CREATE INDEX IF NOT EXISTS idx_students_deleted ON students(deleted_at) WHERE deleted_at IS NULL;
CREATE INDEX IF NOT EXISTS idx_teachers_org ON teachers(organization_id);
CREATE INDEX IF NOT EXISTS idx_fee_heads_org ON fee_heads(organization_id);
CREATE INDEX IF NOT EXISTS idx_fee_structures_org ON fee_structures(organization_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_org ON student_fees(organization_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_student ON student_fees(student_id);
CREATE INDEX IF NOT EXISTS idx_student_fees_status ON student_fees(status);

-- 1.6 Enable RLS on all new tables
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;

-- RLS Policies for academic_years
CREATE POLICY "org_members_academic_years_select" ON academic_years FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_academic_years_insert" ON academic_years FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_academic_years_update" ON academic_years FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_academic_years_delete" ON academic_years FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for school_classes
CREATE POLICY "org_members_school_classes_select" ON school_classes FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_school_classes_insert" ON school_classes FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_school_classes_update" ON school_classes FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_school_classes_delete" ON school_classes FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for students (org members + self access)
CREATE POLICY "org_members_students_select" ON students FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "org_members_students_insert" ON students FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_students_update" ON students FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_students_delete" ON students FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for teachers
CREATE POLICY "org_members_teachers_select" ON teachers FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR user_id = auth.uid()
  );

CREATE POLICY "org_members_teachers_insert" ON teachers FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_teachers_update" ON teachers FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_teachers_delete" ON teachers FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for fee_heads
CREATE POLICY "org_members_fee_heads_select" ON fee_heads FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_heads_insert" ON fee_heads FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_heads_update" ON fee_heads FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_heads_delete" ON fee_heads FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for fee_structures
CREATE POLICY "org_members_fee_structures_select" ON fee_structures FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_structures_insert" ON fee_structures FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_structures_update" ON fee_structures FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_structures_delete" ON fee_structures FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for fee_schedules
CREATE POLICY "org_members_fee_schedules_select" ON fee_schedules FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_schedules_insert" ON fee_schedules FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_schedules_update" ON fee_schedules FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_fee_schedules_delete" ON fee_schedules FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- RLS Policies for student_fees (org members + student self access)
CREATE POLICY "org_members_student_fees_select" ON student_fees FOR SELECT
  TO authenticated
  USING (
    organization_id IN (
      SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
    )
    OR student_id IN (
      SELECT id FROM students WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "org_members_student_fees_insert" ON student_fees FOR INSERT
  TO authenticated
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_student_fees_update" ON student_fees FOR UPDATE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

CREATE POLICY "org_members_student_fees_delete" ON student_fees FOR DELETE
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Updated_at triggers
CREATE OR REPLACE FUNCTION update_school_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = NOW();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER update_academic_years_updated_at
  BEFORE UPDATE ON academic_years
  FOR EACH ROW
  EXECUTE FUNCTION update_school_updated_at_column();

CREATE TRIGGER update_students_updated_at
  BEFORE UPDATE ON students
  FOR EACH ROW
  EXECUTE FUNCTION update_school_updated_at_column();

CREATE TRIGGER update_student_fees_updated_at
  BEFORE UPDATE ON student_fees
  FOR EACH ROW
  EXECUTE FUNCTION update_school_updated_at_column();