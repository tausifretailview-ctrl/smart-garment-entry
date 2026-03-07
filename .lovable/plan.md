

## Update WhatsApp Message from Sales Dashboard - Remove Product Details

### Problem
The WhatsApp message sent from the Sales Invoice Dashboard includes product line items (sizes, quantities, prices per item), making it long. The user wants only invoice summary details and the invoice link -- matching the example format they provided.

### Changes

**1. Update default template in `src/components/WhatsAppTemplateSettings.tsx`**
- Change the `sales_invoice` default template to match the user's desired format:
  - Greeting with customer name
  - Organization name header
  - Invoice number, date, amount, payment status, outstanding balance
  - Invoice view/download link
  - Payment request line
  - Thank you closing
  - Remove `{invoice_items}` placeholder from the default

**2. Update `src/hooks/useWhatsAppTemplates.tsx`**
- Update the `getDefaultMessage` function to remove items from the default sales invoice message
- Add `{invoice_link}` and `{organization_name}` placeholders to the replacement logic
- Keep `{invoice_items}` placeholder functional (for users who add it back in custom templates)

**3. Update `src/pages/SalesInvoiceDashboard.tsx`**
- In `handleSendWhatsApp` (line ~889-935): Stop building `itemsList` and instead pass the invoice URL directly
- Pass `invoiceUrl` and `organizationName` to `formatMessage` so the template can use `{invoice_link}` and `{organization_name}`
- Also update the quick send at line ~206 to include the invoice link

**4. Update the short WhatsApp send** (line 204-208 in SalesInvoiceDashboard)
- Build invoice URL and pass a proper formatted message with link (no items)

### New Default Template Format
```
👋 Hello {customer_name},

🧾 Invoice Generated Successfully

🏢 {organization_name} has generated the following invoice for your order.

🔢 Invoice No: {invoice_number}
📅 Date: {invoice_date}
💰 Invoice Amount: {amount}
⏳ Payment Status: {payment_status}
📊 Outstanding Balance: {outstanding_amount}

🔗 View / Download Invoice:
{invoice_link}

💳 Kindly arrange payment at your convenience.

🙏 Thank you for your continued business with us.
```

### Files to Modify
- `src/components/WhatsAppTemplateSettings.tsx` - update default template text
- `src/hooks/useWhatsAppTemplates.tsx` - add `{invoice_link}`, `{organization_name}` placeholders; update default message
- `src/pages/SalesInvoiceDashboard.tsx` - pass invoice URL and org name instead of item list

