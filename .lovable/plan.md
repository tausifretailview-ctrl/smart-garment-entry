

# Advance Booking Dashboard - Full Feature Build

## Overview
Create a dedicated **Advance Booking Dashboard** page accessible from the Sales menu in the sidebar. This dashboard will mirror the style of existing dashboards (like Sales Invoice Dashboard) with summary cards, a searchable/filterable table of all advance bookings, and support for **refunding** advances.

## What Will Be Built

### 1. New Route & Page: `/advance-booking-dashboard`
- New page file: `src/pages/AdvanceBookingDashboard.tsx`
- Register route in `src/App.tsx` under the OrgLayout sales routes
- Add "Advance Booking" menu item in the Sales section of the sidebar (`AppSidebar.tsx`)

### 2. Dashboard Summary Cards (Top Section)
Four colored metric cards similar to Sales Invoice Dashboard:
- **Total Advances** - Count of all advance records
- **Total Amount** - Sum of all advance amounts (in INR)
- **Used Amount** - Sum of used_amount across all advances
- **Available Balance** - Total amount minus total used (pending balance)

### 3. Data Table with Filters
- Columns: Advance No, Customer Name, Phone, Date, Amount, Used, Available, Payment Method, Status, Actions
- **Search**: By advance number, customer name, or phone
- **Date Filter**: All Time, Today, This Week, This Month, Custom Range
- **Status Filter**: All, Active, Partially Used, Fully Used, Refunded
- Server-side pagination (50 per page) with total count for performance
- `staleTime: 30000` to reduce cloud usage

### 4. Add Advance Booking Button
- "New Advance" button in the top-right corner
- Opens the existing `AddAdvanceBookingDialog` component

### 5. Advance Refund Feature
- New "Refund" action button in the Actions column (visible only for active/partially_used advances)
- Opens a **Refund Dialog** with:
  - Display: Advance number, customer name, original amount, used amount, available (refundable) balance
  - Input: Refund amount (max = available balance), refund payment method, refund reason/description
  - On submit: Updates the advance record's `used_amount` by adding the refund amount, and sets status to `fully_used` if fully consumed, or `refunded` if entire available balance is refunded
- New database column needed: No new columns required. The status field already supports custom values. We will use status = `refunded` for fully refunded advances.
- A new `advance_refunds` table will track refund history for audit purposes.

### 6. Database Migration
Create an `advance_refunds` table:
```
advance_refunds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  advance_id UUID NOT NULL REFERENCES customer_advances(id),
  refund_amount NUMERIC NOT NULL,
  refund_date DATE NOT NULL DEFAULT CURRENT_DATE,
  payment_method TEXT DEFAULT 'cash',
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ DEFAULT now()
)
```
With RLS policies matching the existing organization-scoped pattern.

## Technical Details

### Files to Create
1. **`src/pages/AdvanceBookingDashboard.tsx`** - Main dashboard page with cards, filters, table, refund dialog
2. Database migration for `advance_refunds` table

### Files to Modify
1. **`src/App.tsx`** - Add route for `/advance-booking-dashboard`
2. **`src/components/AppSidebar.tsx`** - Add "Advance Booking" link under Sales menu (using `Coins` icon)
3. **`src/hooks/useCustomerAdvances.tsx`** - Add `refundAdvance` mutation

### Sidebar Menu Addition
Under the Sales collapsible menu, after the Challan Dashboard entry, add:
```
Advance Booking -> /advance-booking-dashboard
```
Using the `Coins` icon from lucide-react.

### Refund Logic (in useCustomerAdvances hook)
```
refundAdvance mutation:
1. Validate refund amount <= available balance (amount - used_amount)
2. Insert record into advance_refunds table
3. Update customer_advances: used_amount += refundAmount
4. If used_amount >= amount -> status = 'refunded' (or 'fully_used')
5. Else -> status = 'partially_used'
6. Invalidate relevant queries
```

### Performance Considerations
- Server-side pagination with `.range()` (50 rows per page)
- Debounced search (300ms)
- `staleTime: 30000` on queries
- Summary cards use a separate lightweight aggregation query
- Join with customers table only for displayed page

