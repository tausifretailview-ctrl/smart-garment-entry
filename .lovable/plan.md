

## Plan: Show Only Pending Balance Invoices in WhatsApp Account Statement

### Problem
The WhatsApp account statement currently shows the last 5-10 transactions including fully paid invoices and payment receipts. The user wants it to show **only invoices that still have a remaining balance** (unpaid/partially paid).

### Changes

#### 1. Update `src/components/CustomerLedger.tsx` (lines 1229-1243)
Replace the "last 5 transactions" logic with filtered pending-balance invoices:
- Filter transactions to only include `type === 'invoice'` entries
- For each invoice, calculate its remaining balance by tracking payments against it
- Only include invoices where remaining balance > 0
- Show each pending invoice with: date, reference number, invoice amount, and remaining balance
- Change section header from "Recent Transactions" to "Pending Invoices"

#### 2. Update `src/pages/salesman/SalesmanCustomerAccount.tsx` (lines 244-262)
Apply the same logic:
- Filter transactions to only `type === 'sale'` (invoice) entries that have remaining balance
- Show pending invoice details with balance remaining
- Update header text accordingly

### New Message Format
```
📊 *Account Statement*

*POOJA TRADING-KANDIVALI W*
As on: 19 Mar 2026

Opening Balance: ₹0
Total Sales: ₹47,937
Total Paid: ₹6,641
────────────────
*Outstanding: ₹41,297*

📋 *Pending Invoices:*
23/01/26 | INV/25-26/213 | ₹9,099 | Bal: ₹9,099
05/02/26 | INV/25-26/381 | ₹9,370 | Bal: ₹9,370
11/02/26 | INV/25-26/435 | ₹5,506 | Bal: ₹5,506
25/02/26 | INV/25-26/569 | ₹4,248 | Bal: ₹4,248
11/03/26 | INV/25-26/686 | ₹13,074 | Bal: ₹13,074

Please clear your dues at the earliest. Thank you! 🙏
```

### Approach
- From the `transactions` array, collect all invoice (debit) entries and all payment (credit) entries
- Build a map of payments per invoice reference to calculate remaining balance
- Use running balance from the transaction list to determine per-invoice remaining amount
- Only display invoices where the computed remaining balance > 0
- Fully paid invoices and receipt entries are excluded entirely

