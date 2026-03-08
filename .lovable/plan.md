

## Plan: Create 4 Server-Side RPC Functions (Migration Only)

Database-only migration — no frontend changes.

### Functions

**1. `get_sales_summary(p_org_id uuid, p_start_date date, p_end_date date)` → JSON**
- Table: `sales`
- Filters: `organization_id = p_org_id`, `deleted_at IS NULL`, `sale_date BETWEEN p_start_date AND p_end_date`
- Returns: `total_count`, `total_amount` (SUM net_amount), `paid_amount` (SUM where payment_status='paid'), `partial_amount` (SUM where 'partial'), `pending_amount` (SUM where 'pending'), `paid_count`, `partial_count`, `pending_count`

**2. `get_purchase_summary(p_org_id uuid, p_start_date date, p_end_date date)` → JSON**
- Table: `purchase_bills`
- Filters: `organization_id`, `deleted_at IS NULL`, `bill_date BETWEEN`
- Returns: `total_count`, `total_amount` (SUM net_amount), `paid_amount` (SUM net_amount where paid), `unpaid_amount` (SUM where unpaid/pending), `partial_amount` (SUM where partial)

**3. `get_outstanding_summary(p_org_id uuid)` → JSON**
- Table: `sales`
- Filters: `organization_id`, `deleted_at IS NULL`, `payment_status IN ('pending','partial')`
- Returns: `total_receivable` (SUM net_amount), `total_outstanding` (SUM net_amount - COALESCE(paid_amount,0)), `customer_count` (COUNT DISTINCT customer_id)

**4. `get_quotation_summary(p_org_id uuid)` → JSON**
- Table: `quotations`
- Filters: `organization_id`, `deleted_at IS NULL`
- Returns: `total_count`, `total_amount` (SUM net_amount), `draft_count` (status='draft'), `sent_count` (status='sent'), `accepted_count` (status='accepted')

### Properties
All functions: `LANGUAGE sql`, `STABLE`, `SECURITY DEFINER`, `SET search_path = public`, return `json` via `row_to_json`.

### File
Single migration file with all 4 functions.

