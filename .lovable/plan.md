
# Complete Advance Booking Feature Implementation

## Problem Identified
The database table `customer_advances` was created, but the frontend components were never built. The following are missing:
- `AddAdvanceBookingDialog.tsx` component
- `useCustomerAdvances.tsx` hook
- Button and dialog integration in `Accounts.tsx`

---

## Implementation Plan

### 1. Create `useCustomerAdvances.tsx` Hook
A hook to manage customer advance operations:
- `fetchCustomerAdvances(customerId)` - Get all advances for a customer
- `getAvailableAdvanceBalance(customerId)` - Calculate unused balance
- `applyAdvance(advanceId, amount)` - Deduct from an advance (for POS/Invoice use)

### 2. Create `AddAdvanceBookingDialog.tsx` Component
A compact dialog with:
- Customer search dropdown (required)
- Amount input (required, auto-focus)
- Payment method selection (cash/card/upi/bank_transfer)
- Optional description field
- Conditional cheque/transaction fields
- Generate advance number via `generate_advance_number` function

### 3. Update `Accounts.tsx`
- Import `Coins` icon and `AddAdvanceBookingDialog`
- Add `showAdvanceDialog` state
- Add "Booking Advance" button in the Recent Customer Payments card header
- Render the dialog component

### 4. Update `CustomerLedger.tsx`
- Import and use `useCustomerAdvances` hook
- Add advance entries to transaction timeline with purple "ADVANCE" badge
- Include advances in balance calculation

---

## File Changes Summary

| File | Action |
|------|--------|
| `src/hooks/useCustomerAdvances.tsx` | CREATE - Hook for advance operations |
| `src/components/AddAdvanceBookingDialog.tsx` | CREATE - Dialog to record advances |
| `src/pages/Accounts.tsx` | MODIFY - Add button and dialog integration |
| `src/components/CustomerLedger.tsx` | MODIFY - Display advances in timeline |

---

## Technical Details

### Database Already Ready
The `customer_advances` table and `generate_advance_number` function already exist from previous migration.

### Balance Formula Update
After implementation, balance calculation will include:
```
Balance = Opening Balance + Total Sales - Total Paid - Unused Advances
```

### UI Location
The "Booking Advance" button will appear in the "Recent Customer Payments" card header, next to existing controls.
