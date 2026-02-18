

# Fix: Make Invoice Selection Mandatory When Pending Invoices Exist

## Problem
When a customer has pending invoices, the user can skip selecting any invoice and the payment gets recorded as an "Opening Balance Payment." This means the actual invoice's `payment_status` never gets updated, so the Sale and POS dashboards continue showing "Not Paid" even though money was received.

## Solution
Add a validation check in the payment form submission: if the selected customer has pending invoices, at least one invoice must be selected before the payment can be saved.

## Technical Details

**File: `src/components/accounts/CustomerPaymentTab.tsx`**

1. **Add validation in `handleSubmit` (around line 357-362):**
   - After checking for a valid customer, check if `customerInvoices` has items
   - If pending invoices exist and `selectedInvoiceIds` is empty, show an error toast: "Please select at least one pending invoice" and block submission

2. **Update the invoice selection label (line 470):**
   - Change from "Select Invoices (Optional - Leave empty for Opening Balance)" to conditionally show:
     - "Select Invoices (Required)" when pending invoices exist
     - "No pending invoices - Payment will be applied to Opening Balance" when none exist

3. **Update the info message (line 498-500):**
   - Change the amber info message to a red warning: "Please select at least one invoice to proceed" when pending invoices exist, making it clear this is required, not optional

This ensures every payment against a customer with pending invoices is properly linked to an invoice, keeping the Sale/POS dashboard statuses accurate.
