
# School Module Integration Plan for EZzy ERP

## Executive Summary

This plan adds a comprehensive **School ERP Module** to the existing EZzy ERP platform. The module reuses all existing features (Purchase, Sale, POS, Accounts, Payments, Inventory, Reports, WhatsApp) and adds education-specific functionality for Students, Teachers, Fees Management, and a dedicated Student/Parent Portal.

---

## Architecture Overview

```text
+------------------------------------------------------------------+
|                        EZzy ERP Platform                          |
+------------------------------------------------------------------+
|  Organization Type                                                |
|  +---------------+     +------------------+                       |
|  | business      | <-- | EXISTING         |                       |
|  | (default)     |     | All current orgs |                       |
|  +---------------+     +------------------+                       |
|  +---------------+     +------------------+                       |
|  | school        | <-- | NEW              |                       |
|  |               |     | School-specific  |                       |
|  +---------------+     +------------------+                       |
+------------------------------------------------------------------+
|  Shared Modules (organization_id scoped)                          |
|  [Purchase] [Sale] [POS] [Accounts] [Payments] [Inventory]        |
|  [Reports] [WhatsApp] [Settings] [User Management]                |
+------------------------------------------------------------------+
|  School-Only Modules (when organization_type = 'school')          |
|  [Students] [Teachers] [Fees] [Academic Years] [Classes]          |
|  [Fee Schedules] [Student Portal] [School Dashboard]              |
+------------------------------------------------------------------+
```

---

## Phase 1: Database Schema Changes

### 1.1 Add Organization Type

Add a new column to the `organizations` table to distinguish between business and school organizations.

```sql
-- Add organization_type column
ALTER TABLE organizations 
ADD COLUMN organization_type TEXT NOT NULL DEFAULT 'business';

-- Add check constraint for valid types
ALTER TABLE organizations 
ADD CONSTRAINT valid_organization_type 
CHECK (organization_type IN ('business', 'school'));

-- Add index for filtering
CREATE INDEX idx_organizations_type ON organizations(organization_type);
```

### 1.2 Academic Configuration Tables

```sql
-- Academic years table
CREATE TABLE academic_years (
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

-- Classes/Standards table
CREATE TABLE school_classes (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  class_name TEXT NOT NULL,
  section TEXT,
  display_order INTEGER DEFAULT 0,
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, class_name, section)
);
```

### 1.3 Students Table

```sql
CREATE TABLE students (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  admission_number TEXT NOT NULL,
  student_name TEXT NOT NULL,
  class_id UUID REFERENCES school_classes(id),
  academic_year_id UUID REFERENCES academic_years(id),
  date_of_birth DATE,
  gender TEXT,
  address TEXT,
  -- Parent/Guardian Details
  parent_name TEXT,
  parent_phone TEXT,
  parent_email TEXT,
  parent_relation TEXT,
  emergency_contact TEXT,
  -- Linked accounts
  customer_id UUID REFERENCES customers(id),
  user_id UUID REFERENCES auth.users(id),
  -- Status
  status TEXT DEFAULT 'active',
  admission_date DATE DEFAULT CURRENT_DATE,
  photo_url TEXT,
  notes TEXT,
  -- Soft delete
  deleted_at TIMESTAMPTZ,
  deleted_by UUID,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, admission_number)
);
```

### 1.4 Teachers Table (Extends Employees)

```sql
CREATE TABLE teachers (
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
  -- Login access (view-only)
  user_id UUID REFERENCES auth.users(id),
  can_view_students BOOLEAN DEFAULT true,
  can_view_fees BOOLEAN DEFAULT false,
  -- Status
  status TEXT DEFAULT 'active',
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(organization_id, teacher_code)
);
```

### 1.5 Fee Management Tables

```sql
-- Fee heads (Tuition, Library, Transport, Exam, etc.)
CREATE TABLE fee_heads (
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

-- Class-wise fee structure
CREATE TABLE fee_structures (
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

-- Fee schedule (when fees are due)
CREATE TABLE fee_schedules (
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

-- Student fee transactions (linked to existing payments system)
CREATE TABLE student_fees (
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
  -- Links to existing payment system
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
```

### 1.6 RLS Policies

```sql
-- Enable RLS on all new tables
ALTER TABLE academic_years ENABLE ROW LEVEL SECURITY;
ALTER TABLE school_classes ENABLE ROW LEVEL SECURITY;
ALTER TABLE students ENABLE ROW LEVEL SECURITY;
ALTER TABLE teachers ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_heads ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_structures ENABLE ROW LEVEL SECURITY;
ALTER TABLE fee_schedules ENABLE ROW LEVEL SECURITY;
ALTER TABLE student_fees ENABLE ROW LEVEL SECURITY;

-- Organization member policies (same pattern as existing tables)
CREATE POLICY "org_members_select" ON students FOR SELECT
  TO authenticated
  USING (organization_id IN (
    SELECT organization_id FROM organization_members WHERE user_id = auth.uid()
  ));

-- Student self-access policy
CREATE POLICY "student_self_access" ON students FOR SELECT
  TO authenticated
  USING (user_id = auth.uid());

-- Similar policies for all other school tables...
```

### 1.7 New App Role for Students

```sql
-- Add 'student' role to app_role enum
ALTER TYPE app_role ADD VALUE 'student';
ALTER TYPE app_role ADD VALUE 'teacher';
```

---

## Phase 2: Frontend Components

### 2.1 New Directory Structure

```text
src/
├── pages/
│   └── school/
│       ├── SchoolDashboard.tsx
│       ├── StudentMaster.tsx
│       ├── StudentEntry.tsx
│       ├── TeacherMaster.tsx
│       ├── FeeHeadsMaster.tsx
│       ├── FeeStructureSetup.tsx
│       ├── FeeCollection.tsx
│       ├── FeeDuesReport.tsx
│       ├── ClassWiseCollection.tsx
│       ├── AcademicYearSetup.tsx
│       └── ClassSectionSetup.tsx
│   └── student-portal/
│       ├── StudentLogin.tsx
│       ├── StudentDashboard.tsx
│       ├── StudentFees.tsx
│       └── StudentPaymentHistory.tsx
├── layouts/
│   ├── SchoolLayout.tsx
│   └── StudentPortalLayout.tsx
├── components/
│   └── school/
│       ├── StudentCard.tsx
│       ├── FeeReceiptPrint.tsx
│       ├── StudentImportDialog.tsx
│       ├── FeePaymentDialog.tsx
│       ├── DuesSMSDialog.tsx
│       └── SchoolQuickActions.tsx
├── hooks/
│   └── useSchoolFeatures.tsx
│   └── useStudentAccess.tsx
```

### 2.2 School Dashboard Component

The School Dashboard will show education-specific metrics while reusing the existing dashboard pattern:

| Widget | Source |
|--------|--------|
| Fees Collected Today | `student_fees` table with `paid_date = today` |
| Pending Fees | `student_fees` where `status = 'pending'` |
| Student Count | `students` grouped by class |
| Stock Summary | REUSES existing inventory queries |
| Quick Actions | Add Student, Collect Fees, View Dues |

### 2.3 Navigation Integration

Modify `AppSidebar.tsx` to conditionally show school-specific menu items:

```typescript
// In AppSidebar.tsx
const { currentOrganization } = useOrganization();
const isSchool = currentOrganization?.organization_type === 'school';

// Show school menu section only for school orgs
{isSchool && (
  <SidebarGroup>
    <SidebarGroupLabel>School</SidebarGroupLabel>
    <SidebarMenu>
      <SidebarMenuItem>
        <NavLink to="/school-dashboard">Dashboard</NavLink>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <NavLink to="/students">Students</NavLink>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <NavLink to="/teachers">Teachers</NavLink>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <NavLink to="/fee-collection">Fee Collection</NavLink>
      </SidebarMenuItem>
      <SidebarMenuItem>
        <NavLink to="/fee-reports">Fee Reports</NavLink>
      </SidebarMenuItem>
    </SidebarMenu>
  </SidebarGroup>
)}
```

---

## Phase 3: Key Features Implementation

### 3.1 Student Registration

- Form-based entry similar to CustomerMaster
- Auto-create linked customer account for payments
- Generate unique admission number per school
- Excel bulk import using existing `ExcelImportDialog` pattern
- Photo upload using existing storage integration

### 3.2 Fee Collection (Reuses Existing Payments)

The fee collection workflow integrates with existing payments:

```text
Fee Due -> Create Sale Entry (fee as product) -> Record Payment -> Auto-Receipt
```

| Step | Implementation |
|------|---------------|
| Fee Posting | Creates entries in `student_fees` table |
| Payment Collection | Uses existing `payment_receipts` table |
| Receipt Generation | Uses existing `PaymentReceipt` component |
| Online Payment | Uses existing `PaymentGatewaySettings` |

### 3.3 Student Portal (Public Access)

A separate login flow for students/parents:

- Route: `/:orgSlug/student-portal`
- Authentication: Uses student's `user_id` linked account
- Features:
  - View fee dues
  - Pay online (uses existing payment gateway)
  - Download receipts
  - NO access to ERP modules (enforced by RoleProtectedRoute)

### 3.4 School Reports

| Report | Implementation |
|--------|---------------|
| Student Fee Due Report | New query on `student_fees` with status filter |
| Class-wise Collection | GROUP BY class from `student_fees` |
| Student Payment History | Filter existing `payment_receipts` by student |
| Inventory Issue Report | REUSES existing stock reports with "issue" filter |

---

## Phase 4: Routing Changes

### 4.1 New Routes in App.tsx

```typescript
// School module routes (organization-scoped)
<Route path="school-dashboard" element={
  <ProtectedRoute>
    <SchoolFeatureGate>
      <Layout><SchoolDashboard /></Layout>
    </SchoolFeatureGate>
  </ProtectedRoute>
} />
<Route path="students" element={...} />
<Route path="student-entry" element={...} />
<Route path="student-entry/:id" element={...} />
<Route path="teachers" element={...} />
<Route path="fee-collection" element={...} />
<Route path="fee-structures" element={...} />
<Route path="fee-heads" element={...} />
<Route path="academic-years" element={...} />
<Route path="classes" element={...} />
<Route path="fee-due-report" element={...} />
<Route path="class-collection-report" element={...} />

// Student Portal routes (separate layout)
<Route path="student-portal" element={<StudentPortalLayout />}>
  <Route index element={<StudentDashboard />} />
  <Route path="fees" element={<StudentFees />} />
  <Route path="payments" element={<StudentPaymentHistory />} />
</Route>
```

### 4.2 SchoolFeatureGate Component

A wrapper that only renders children if the current organization is a school:

```typescript
const SchoolFeatureGate = ({ children }) => {
  const { currentOrganization } = useOrganization();
  
  if (currentOrganization?.organization_type !== 'school') {
    return <Navigate to="/" replace />;
  }
  
  return <>{children}</>;
};
```

---

## Phase 5: Security Implementation

### 5.1 Role-Based Access Matrix

| Role | Students | Teachers | Fees | Payments | Inventory | Reports |
|------|----------|----------|------|----------|-----------|---------|
| admin | Full | Full | Full | Full | Full | Full |
| manager | Full | Full | Full | Full | View | Full |
| user | View | View | Collect | View | View | Limited |
| teacher | View | Self | None | None | None | None |
| student | Self | None | Self | Self | None | Self |

### 5.2 Data Isolation

All school tables include `organization_id` as NOT NULL with:
- Foreign key to organizations table
- RLS policies filtering by organization membership
- Unique constraints scoped to organization

---

## Phase 6: Implementation Order

### Sprint 1 (Database & Core)
1. Database migration for organization_type
2. Academic years and classes tables
3. Students table with RLS
4. Basic student CRUD pages

### Sprint 2 (Teachers & Fees Setup)
5. Teachers table and pages
6. Fee heads and structures tables
7. Fee setup UI pages
8. Link students to customers

### Sprint 3 (Fee Collection)
9. Fee collection workflow
10. Integration with existing payments
11. Fee receipt printing
12. WhatsApp fee reminder integration

### Sprint 4 (Portal & Reports)
13. Student portal authentication
14. Student dashboard and fee view
15. Online payment for fees
16. Fee due reports
17. Class-wise collection reports

### Sprint 5 (Polish)
18. School dashboard
19. Bulk student import
20. Navigation integration
21. Mobile optimization
22. Performance testing

---

## Technical Considerations

### Reused Components
- `PaymentReceipt` for fee receipts
- `ExcelImportDialog` for student import
- `WhatsAppSend` for fee reminders
- `PaymentGatewaySettings` for online fees
- `CustomerLedger` pattern for student ledger
- All existing inventory and stock reports

### New Dependencies
None - uses existing packages

### Mobile Support
- All new pages use responsive patterns from existing codebase
- Student portal optimized for mobile (parent access)

### Performance
- Pagination on student lists (existing pattern)
- Organization-scoped indexes on all tables
- Tier-based refresh for school dashboard
