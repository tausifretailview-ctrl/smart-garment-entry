

## Problem
The WhatsApp invoice link (public invoice view) is missing several details that appear on the POS print invoice:

1. **Customer Details**: `customer_phone`, `customer_address`, `customer_id` (for GSTIN lookup) — currently hardcoded as empty strings
2. **Finance/EMI Details**: `sale_financer_details` table data not fetched at all
3. **Salesman**: Not fetched from `sales` table
4. **Notes**: Not fetched from `sales` table
5. **Payment Amounts**: `cash_amount`, `card_amount`, `upi_amount`, `paid_amount`, `credit_amount` not fetched
6. **Item Details**: `hsn_code`, `gst_percent`, `color` not fetched from `sale_items`
7. **GST Amounts**: CGST/SGST/IGST not calculated (all set to 0)
8. **Customer GSTIN**: Not fetched from `customers` table
9. **Sale Return Adjust**: Not fetched

## Solution
Update both the **edge function** (`get-public-invoice`) and the **frontend** (`PublicInvoiceView.tsx`) to include all missing data, matching POS print output.

## Changes

### 1. Edge Function: `supabase/functions/get-public-invoice/index.ts`

**Sales query** — add fields: `salesman, notes, customer_id, customer_phone, customer_address, cash_amount, card_amount, upi_amount, paid_amount, credit_amount, sale_return_adjust, einvoice_qr_code, points_redeemed_amount`

**Sale items query** — add fields: `hsn_code, gst_percent, color`

**New queries**:
- Fetch `sale_financer_details` for the sale (financer_name, loan_number, emi_amount, tenure, down_payment, down_payment_mode, finance_discount, bank_transfer_amount)
- Fetch customer GSTIN and transport_details from `customers` table using `customer_id`

**Return** all these in the response payload.

### 2. Frontend: `src/pages/PublicInvoiceView.tsx`

**templateProps** — populate from fetched data:
- `customerMobile` → `sale.customer_phone`
- `customerAddress` → `sale.customer_address`
- `customerGSTIN` → fetched customer GSTIN
- `salesman` → `sale.salesman`
- `notes` → `sale.notes`
- `cashAmount`, `cardAmount`, `upiAmount`, `creditAmount`, `paidAmount`
- `financerDetails` → from fetched financer data
- `saleReturnAdjust` → `sale.sale_return_adjust`
- Items: `hsn`, `gstPercent`, `color` from sale_items
- Calculate CGST/SGST/IGST from item-level GST percentages
- `qrCodeUrl` → `sale.einvoice_qr_code`
- `customerTransportDetails` → from customer data

This ensures the WhatsApp invoice link shows identical content to the POS print invoice.

