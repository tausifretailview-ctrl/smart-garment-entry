
# Daily Tally & Settlement Module - Implementation Plan

## Overview
Create a comprehensive Daily Tally & Settlement page that aggregates all financial inflows and outflows for a selected date, provides cash reconciliation, and allows optional settlement snapshots -- all using read-only aggregation from existing tables plus one new snapshot table.

## Database Changes

### New Table: `daily_tally_snapshot`
A single additive table to store optional end-of-day settlement records. No existing tables are modified.

- Fields: `id`, `organization_id`, `tally_date`, `opening_cash`, `expected_cash`, `physical_cash`, `difference_amount`, `leave_in_drawer`, `deposit_to_bank`, `handover_to_owner`, `notes`, `created_by`, `created_at`
- Unique constraint on `(organization_id, tally_date)` -- one snapshot per day per org
- RLS using the project's standard `user_belongs_to_org` pattern (not `auth.uid()` directly, since this project uses org membership-based access)

## Data Sources (All Read-Only)

| Section | Source Table | Filter |
|---------|-------------|--------|
| POS Sales | `sales` | `sale_type = 'pos'`, date match |
| Invoice Sales | `sales` | `sale_type != 'pos'`, date match |
| Receipts (Old Balance) | `voucher_entries` | `voucher_type = 'receipt'`, date match |
| Advances Received | `customer_advances` | `created_at` date match |
| Supplier Payments | `voucher_entries` | `voucher_type = 'payment'`, `reference_type = 'supplier'` |
| Expenses | `voucher_entries` | `voucher_type = 'expense'` or `reference_type = 'expense'` |
| Employee Salary | `voucher_entries` | `voucher_type = 'payment'`, `reference_type = 'employee'` |
| Sale Returns (Refunds) | `sale_returns` | `refund_type = 'cash_refund'` |

Payment mode breakdown uses `payment_method`, `cash_amount`, `card_amount`, `upi_amount` from sales, and description parsing from vouchers (same pattern as `DailyCashierReport`).

## New Files

### 1. `src/pages/DailyTally.tsx` (Main Page)
The primary page with six sections:

**Header Bar**
- Date picker (default today)
- Refresh button
- Save Snapshot / Print / Export Excel buttons
- Status badge: Balanced (green) / Minor Difference (yellow) / Mismatch (red)

**Section 1 -- Summary Cards (4 cards)**
- Total Sales, Total Collection, Total Payments Out, Net Movement
- Large bold currency values with icons

**Section 2 -- Money In Table**
| Source | Cash | UPI | Card | Bank | Total |
Rows: POS Sales, Sales Invoice, Old Balance Received, Advance Received, **Total Inward**

**Section 3 -- Money Out Table**
| Source | Cash | UPI | Card | Bank | Total |
Rows: Supplier Payment, Shop Expense, Employee Salary, Sale Return Refund, **Total Outward**

**Section 4 -- Cash Reconciliation**
- Left: Opening Cash input + Expected Cash formula result (Opening + Cash In - Cash Out)
- Right: Physical Cash Counted input + Difference display with color coding
- No blocking behavior on mismatch

**Section 5 -- Optional Settlement**
- Leave in Drawer, Deposit to Bank, Handover to Owner inputs
- Auto-calculate: Physical Cash - Leave - Deposit = Owner Handover
- Warning toast if numbers don't add up, but save is never blocked

**Section 6 -- Save/Load Snapshot**
- Save button stores all values to `daily_tally_snapshot` (upsert on org+date)
- Loading a date auto-loads saved snapshot if exists
- Shows "Saved at [time]" indicator

### 2. `src/components/DailyTallyReport.tsx` (Print Component)
A print-optimized component (similar to existing `PaymentReceipt`) containing:
- Company name, date, generated-by info
- Sales summary, payment breakdown, money in/out tables
- Cash reconciliation section
- Settlement summary
- Signature lines
- Uses `useReactToPrint` for browser printing

## Modified Files

### 3. `src/App.tsx`
- Import `DailyTally` page component (lazy loaded)
- Add route: `daily-tally` under org layout with `ProtectedRoute` + `Layout` wrapper (same pattern as `daily-cashier-report`)

### 4. `src/components/AppSidebar.tsx`
- Add "Daily Tally" menu item under the Reports/Accounts section with a `Coins` or `ClipboardList` icon
- Links to `/daily-tally`

## Technical Details

### Data Fetching Strategy
- All data fetched via `useQuery` hooks with date-based keys
- Reuses existing patterns from `DailyCashierReport` (same `fetchAllSalesWithFilters`, `fetchAllVouchersWithFilters` utilities)
- Additional queries for `customer_advances` and `sale_returns`
- Snapshot loaded/saved via simple supabase queries on `daily_tally_snapshot`

### Permission Control
- All users can view today's date
- Manager/Admin can view and edit any date
- Uses existing `useUserRoles` hook for role checks
- Snapshot save restricted to cashier (today only) and admin/manager (any date)

### Performance
- Single date filtering keeps queries lightweight
- No real-time listeners needed
- Snapshot table is tiny (1 row per org per day)

### What Does NOT Change
- No modifications to `sales`, `voucher_entries`, `sale_returns`, or any existing table
- No changes to invoice numbering, RLS policies, or sale triggers
- No shift locking or transaction blocking
- Existing `DailyCashierReport` remains untouched
- Fully backward compatible
