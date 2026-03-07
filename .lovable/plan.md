

## Update Payment Reminder WhatsApp Template

### Changes

**1. `src/components/WhatsAppTemplateSettings.tsx`** - Update `payment_reminder` default template:
```
👋 Hello {customer_name},

🔔 Payment Reminder

This is a friendly reminder that the following invoice is still pending.

🔢 Invoice No: {invoice_number}
📅 Date: {invoice_date}
💰 Invoice Amount: {amount}
📊 Outstanding Balance: {outstanding_amount}

🔗 View Invoice:
{invoice_link}

💳 Kindly arrange the payment at your convenience.

🙏 Thank you for your support.
```

**2. `src/hooks/useWhatsAppTemplates.tsx`** - Add a `payment_reminder` case in `getDefaultMessage` that matches the new format (with invoice link, outstanding balance, no paid/pending amounts)

**3. `src/pages/SalesInvoiceDashboard.tsx`** - Update `handlePaymentReminder` (~line 1000-1023) to:
- Build the invoice URL (same pattern as sales invoice send)
- Fetch customer balance for outstanding amount
- Pass `customerBalance` and `extraData: { invoiceLink, organizationName }` to `formatMessage`

**4. `src/pages/PaymentsDashboard.tsx`** - Same update to `handleSendPaymentReminder` (~line 226-248): build invoice URL, pass customer balance and extra data

### Files to Modify
- `src/components/WhatsAppTemplateSettings.tsx`
- `src/hooks/useWhatsAppTemplates.tsx`
- `src/pages/SalesInvoiceDashboard.tsx`
- `src/pages/PaymentsDashboard.tsx`

