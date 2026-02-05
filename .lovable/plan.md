
# Advance Booking Payment Feature

## Summary
Create a system for customers to make advance payments for product bookings. The advance amounts will:
1. Be recorded via a simple dialog in the Accounts page
2. Appear in the Customer Ledger as credit entries
3. Be adjustable/deductible when creating new sales in POS and Sales Invoice

---

## Feature Flow

```text
1. RECORD ADVANCE
   Accounts Page -> "Add Advance" button -> Quick Dialog -> Save to customer_advances table

2. SHOW IN LEDGER
   Customer Ledger -> Shows advance as credit entry -> Running balance reduces

3. ADJUST IN SALE
   POS/Sales Invoice -> Select Customer -> Show available advance -> Apply to bill
```

---

## Database Design

### New Table: `customer_advances`

| Column | Type | Description |
|--------|------|-------------|
| id | UUID | Primary key |
| organization_id | UUID | FK to organizations (RLS) |
| customer_id | UUID | FK to customers |
| advance_number | TEXT | Auto-generated (ADV/25-26/001) |
| advance_date | DATE | Date of advance payment |
| amount | DECIMAL | Original advance amount |
| used_amount | DECIMAL | Amount already adjusted in sales |
| payment_method | TEXT | cash/card/upi/bank_transfer |
| cheque_number | TEXT | If cheque payment |
| transaction_id | TEXT | If bank/UPI payment |
| description | TEXT | Booking notes (product reserved, etc.) |
| status | TEXT | active/partially_used/fully_used |
| created_at | TIMESTAMP | Record creation time |
| created_by | UUID | User who created |

### Database Function: `generate_advance_number`
Auto-generates sequential advance numbers per organization in format: `ADV/25-26/001`

---

## Implementation Details

### 1. New Component: `AddAdvanceBookingDialog.tsx`

A compact, easy-to-use dialog with:
- Customer search dropdown (required)
- Amount input (required, auto-focus)
- Payment method selection
- Optional description field
- Cheque/transaction fields conditionally shown
- Submit button at bottom

Design: Similar to `QuickAddCustomerDialog.tsx` - minimal fields, Enter key navigation, fixed bottom button.

### 2. Updates to `src/pages/Accounts.tsx`

- Add "Booking Advance" button in Customer Receipts section header
- Opens `AddAdvanceBookingDialog`
- On save: Insert into `customer_advances` table
- Show recent advances in a small section below customer payments

### 3. Updates to `src/components/CustomerLedger.tsx`

- Fetch `customer_advances` records for the selected customer
- Add advance entries to the transactions timeline as CREDIT entries
- Show "Advance" badge (similar to "Invoice" and "Payment" badges)
- Running balance calculation: Advances reduce outstanding (increase credit)

### 4. New Hook: `useCustomerAdvances.tsx`

Provides functions to:
- `getAvailableAdvanceBalance(customerId)` - Returns unused advance amount
- `fetchCustomerAdvances(customerId)` - Get all active advances
- `applyAdvance(customerId, amount)` - Deduct from advances (FIFO like credit notes)

### 5. Updates to `src/pages/POSSales.tsx`

- Import and use `useCustomerAdvances` hook
- When customer is selected, fetch available advance balance
- Add "Apply Advance" button similar to existing "Apply Credit" button
- `advanceApplied` state to track applied amount
- Deduct advance from final bill amount
- Call `applyAdvance()` when sale is saved

### 6. Updates to `src/pages/SalesInvoice.tsx`

- Same integration as POSSales
- Show available advance for selected customer
- Allow applying advance to bill

### 7. Updates to Balance Calculation

Update `src/utils/customerBalanceUtils.ts` and related hooks to include advances in the balance formula:
```
Balance = Opening Balance + Total Sales - Total Paid - Unused Advances
```

---

## UI Mockup: Add Advance Dialog

```text
+----------------------------------+
|  Advance Booking Payment    [X]  |
+----------------------------------+
| Customer*: [Search Customer   v] |
|                                  |
| Amount*:   [₹ 0.00            ]  |
|                                  |
| Method:    [Cash           v  ]  |
|                                  |
| Notes:     [Booking for..     ]  |
|                                  |
| +------------------------------+ |
| |      Record Advance          | |
| +------------------------------+ |
+----------------------------------+
```

---

## UI Integration Points

### Accounts Page
- New "Booking Advance" button with `Coins` icon next to Customer Receipt form
- Recent advances shown in a collapsible section

### Customer Ledger
- Advance entries show with purple "ADVANCE" badge
- Type column shows booking icon
- Description shows booking notes

### POS/Sales Invoice
- When customer has advance balance: Show purple badge "₹X Advance Available"
- "Apply Advance" button to deduct from bill
- Applied advance shows in payment breakdown

---

## Files to Create

| File | Purpose |
|------|---------|
| `src/components/AddAdvanceBookingDialog.tsx` | Main advance entry dialog |
| `src/hooks/useCustomerAdvances.tsx` | Advance balance and application logic |

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Accounts.tsx` | Add advance booking button and dialog integration |
| `src/components/CustomerLedger.tsx` | Fetch and display advance entries in timeline |
| `src/pages/POSSales.tsx` | Integrate advance balance fetch and apply functionality |
| `src/pages/SalesInvoice.tsx` | Same advance integration as POS |
| `src/utils/customerBalanceUtils.ts` | Include advances in balance calculation |
| `src/hooks/useCustomerBalance.tsx` | Include advances in balance query |

---

## Database Migration

```sql
-- Create customer_advances table
CREATE TABLE customer_advances (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID NOT NULL REFERENCES organizations(id),
  customer_id UUID NOT NULL REFERENCES customers(id),
  advance_number TEXT NOT NULL,
  advance_date DATE NOT NULL DEFAULT CURRENT_DATE,
  amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  used_amount DECIMAL(12,2) NOT NULL DEFAULT 0,
  payment_method TEXT DEFAULT 'cash',
  cheque_number TEXT,
  transaction_id TEXT,
  description TEXT,
  status TEXT DEFAULT 'active',
  created_at TIMESTAMPTZ DEFAULT now(),
  created_by UUID,
  UNIQUE(organization_id, advance_number)
);

-- Enable RLS
ALTER TABLE customer_advances ENABLE ROW LEVEL SECURITY;

-- RLS policies
CREATE POLICY "Users can view advances for their organization"
  ON customer_advances FOR SELECT
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can insert advances for their organization"
  ON customer_advances FOR INSERT
  WITH CHECK (organization_id IN (
    SELECT organization_id FROM user_organizations 
    WHERE user_id = auth.uid()
  ));

CREATE POLICY "Users can update advances for their organization"
  ON customer_advances FOR UPDATE
  USING (organization_id IN (
    SELECT organization_id FROM user_organizations 
    WHERE user_id = auth.uid()
  ));

-- Index for performance
CREATE INDEX idx_customer_advances_org_customer 
  ON customer_advances(organization_id, customer_id);

CREATE INDEX idx_customer_advances_status 
  ON customer_advances(status) WHERE status = 'active';

-- Function to generate advance number
CREATE OR REPLACE FUNCTION generate_advance_number(p_organization_id UUID)
RETURNS TEXT AS $$
DECLARE
  v_fiscal_year TEXT;
  v_next_number INT;
  v_prefix TEXT := 'ADV';
BEGIN
  SELECT CASE 
    WHEN EXTRACT(MONTH FROM CURRENT_DATE) >= 4 
    THEN TO_CHAR(CURRENT_DATE, 'YY') || '-' || TO_CHAR(CURRENT_DATE + INTERVAL '1 year', 'YY')
    ELSE TO_CHAR(CURRENT_DATE - INTERVAL '1 year', 'YY') || '-' || TO_CHAR(CURRENT_DATE, 'YY')
  END INTO v_fiscal_year;

  SELECT COALESCE(MAX(
    CAST(SPLIT_PART(advance_number, '/', 3) AS INTEGER)
  ), 0) + 1
  INTO v_next_number
  FROM customer_advances
  WHERE organization_id = p_organization_id
    AND advance_number LIKE v_prefix || '/' || v_fiscal_year || '/%';

  RETURN v_prefix || '/' || v_fiscal_year || '/' || LPAD(v_next_number::TEXT, 4, '0');
END;
$$ LANGUAGE plpgsql;
```

---

## Testing Checklist

1. Record advance for customer in Accounts page
2. Verify advance appears in Customer Ledger with correct badge
3. Verify customer balance reduces after advance
4. Select customer in POS - verify advance balance shows
5. Apply advance to bill - verify deduction
6. Verify advance status updates to "partially_used" or "fully_used"
7. Verify FIFO order when multiple advances exist
