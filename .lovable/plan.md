
# Fix: Customer Name Not Showing for POS Receipt (RCP/25-26/333)

## Problem
In the Customer Payment tab (Accounts), receipt **RCP/25-26/333** for POS sale **POS/25-26/1760** shows "-" instead of "Manish Jain" in the Customer column.

**Root cause**: The customer name lookup logic tries to find the sale in the loaded `sales` array. If the sale isn't found (due to pagination or date filtering), it falls back to searching the `customers` array using the voucher's `reference_id` -- but for sale-type vouchers, `reference_id` is a **sale ID**, not a customer ID, so the fallback never matches.

## Solution
Improve the customer name resolution in `CustomerPaymentTab.tsx` to handle sale-type vouchers whose sales aren't in the currently loaded sales list.

### Technical Details

**File: `src/components/accounts/CustomerPaymentTab.tsx` (line ~703-705)**

Current logic:
```
const invoice = sales?.find(s => s.id === voucher.reference_id);
const customerName = invoice?.customer_name 
  || customers?.find(c => c.id === voucher.reference_id)?.customer_name 
  || "-";
```

Updated logic:
```
const invoice = sales?.find(s => s.id === voucher.reference_id);
let customerName = "-";
if (invoice?.customer_name) {
  customerName = invoice.customer_name;
} else if (voucher.reference_type === 'customer') {
  customerName = customers?.find(c => c.id === voucher.reference_id)?.customer_name || "-";
} else if (invoice?.customer_id) {
  customerName = customers?.find(c => c.id === invoice.customer_id)?.customer_name || "-";
}
```

This ensures:
- **Sale-type vouchers**: Uses `invoice.customer_name` directly, or falls back to looking up the customer via `invoice.customer_id` in the customers list
- **Customer-type vouchers** (opening balance payments): Correctly matches by customer ID as before
- Also apply the same fix to the receipt print lookup at ~line 729 to ensure receipts also show the correct customer name
