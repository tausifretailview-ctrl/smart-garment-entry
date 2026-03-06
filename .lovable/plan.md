

## Plan: Add Date-Time to Customer Ledger Transactions

### Problem
The customer ledger currently shows only **dates** (dd MMM yyyy) for transactions, making it difficult to verify exact transaction timing — especially when multiple transactions happen on the same day.

### Solution
Enhance the existing Customer Ledger to include **exact timestamps** (`created_at`) alongside transaction dates. This requires two changes:

### Changes

**1. Fetch `created_at` from all data sources** (`src/components/CustomerLedger.tsx`)
- Add `created_at` to the `.select()` calls for: `sales`, `voucher_entries`, `customer_advances`, `customer_balance_adjustments`
- Add a `timestamp` field to the `Transaction` interface
- Store `created_at` in each transaction entry
- Sort combined transactions by `created_at` (timestamp) instead of just `date` for accurate chronological ordering

**2. Display time in the ledger table** (`src/components/CustomerLedger.tsx`)
- Show date + time in the transaction rows: `dd MMM yyyy, hh:mm a` (e.g., "06 Mar 2026, 02:30 PM")
- On mobile, show date on one line and time on the next line for space efficiency
- Include timestamp in PDF export and WhatsApp statement

**3. Apply same enhancement to SalesmanCustomerAccount** (`src/pages/salesman/SalesmanCustomerAccount.tsx`)
- Fetch `created_at` from sales and voucher queries
- Display time alongside date in the transaction cards

### Transaction Interface Update
```typescript
interface Transaction {
  id: string;
  date: string;
  timestamp: string | null; // created_at for exact time
  type: 'invoice' | 'payment' | 'advance' | 'adjustment' | 'fee';
  // ... rest unchanged
}
```

### Files to Modify
1. `src/components/CustomerLedger.tsx` — Main ledger: fetch timestamps, display time, PDF/WhatsApp export
2. `src/pages/salesman/SalesmanCustomerAccount.tsx` — Salesman view: fetch and display timestamps

No database changes needed — `created_at` already exists on all relevant tables.

