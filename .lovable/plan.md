

## Remove Extra ADJ Entry from Saba Latif's Ledger

### Problem
Saba Latif's customer ledger shows an extra ADJ entry with outstanding_difference of -202,500 (appearing as a debit of 2,02,500). This needs to be removed from the ledger display only, while keeping the current balances (opening_balance = 0, advance = 81,800) unchanged.

### Solution
Delete the specific adjustment record from `customer_balance_adjustments` table so it no longer appears in the ledger. Since you confirmed balances should stay as-is, only the adjustment record itself will be removed.

### Technical Details

**Database Change (via migration):**
```sql
DELETE FROM customer_balance_adjustments 
WHERE id = 'ffc7a325-e5c1-4d35-b2ed-c47f6e658eb6';
```

This removes the single adjustment record for Saba Latif (customer_id: `22d75b78-1a84-4b5b-b2f7-a506b11e9b61`) created on 25 Feb 2026.

**What stays unchanged:**
- Customer opening_balance remains 0
- Customer advance of 81,800 (ADV/25-26/0607) remains active
- All invoices and other ledger entries remain intact

**Impact:** The ADJ row with 2,02,500 will no longer appear in the customer ledger view.

