

## Add "Refund Advance" Shortcut in Customer Ledger + Improve Advance Booking Refund Button

### Problem
The refund feature exists in Advance Booking Dashboard but is hard to discover. Customers with unused advance balance show on the Ledger page with no action path to process a refund.

### Changes

**File 1: `src/components/CustomerLedger.tsx`**

1. Add `Undo2` to the existing lucide imports (line 11)
2. After the balance badge section (around line 1634), add a "Refund Advance" button that appears when `selectedCustomer.balance < 0`:
   - Shows a compact alert-style card: "₹X advance available for refund"
   - Button navigates to `/advance-booking-dashboard?search=CustomerName`
   - Uses `window.location.pathname.split('/')[1]` for org slug

**File 2: `src/pages/AdvanceBookingDashboard.tsx`**

1. Add `useSearchParams` import from react-router-dom
2. Add `useEffect` import (already has useState/useMemo/useCallback/useRef)
3. On mount, read `search` query param and pre-fill both `search` and `debouncedSearch` state
4. Make Refund button more prominent: show refund amount in button text: `Refund ₹X` instead of just "Refund"

### Result
- Customer Ledger shows a clear "Refund Advance" shortcut when advance balance exists
- Clicking it navigates to Advance Booking Dashboard with customer name pre-searched
- Refund button shows the refundable amount, making it unmissable

