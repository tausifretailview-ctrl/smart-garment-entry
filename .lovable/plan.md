
# Plan: Customer Balance & Advance Import from Excel

## Overview
Add a feature to import customer outstanding balances and advance payments from an Excel file with two sheets (Bal for outstanding, Adv for advances) for the ELLA NOOR organization.

## Excel File Structure Analyzed

**Sheet "Bal" - Outstanding Balances:**
| Column | Purpose |
|--------|---------|
| Party Name | Customer name |
| Contact No. | Phone number (e.g., +91-9391317936) |
| Closing | Outstanding balance (positive number) |

**Sheet "Adv" - Advance Payments:**
| Column | Purpose |
|--------|---------|
| Party Name | Customer name |
| Contact No. | Phone number |
| Closing | Advance amount (negative in source, will convert to positive) |

---

## Implementation Steps

### 1. Create Balance/Advance Import Dialog Component

Create `src/components/CustomerBalanceImportDialog.tsx`:
- Parse Excel file with multi-sheet support
- Read "Bal" sheet for outstanding balances
- Read "Adv" sheet for advance payments
- Preview data before import
- Match customers by normalized phone number
- Show match statistics (found/not found)

### 2. Import Logic

**For Outstanding Balances (Bal sheet):**
- Match customers by phone number (normalize both Excel and database phones)
- Update `customers.opening_balance` field with the "Closing" value
- Track success/skip/error counts

**For Advance Payments (Adv sheet):**
- Match customers by phone number
- Create entries in `customer_advances` table
- Convert negative closing to positive amount
- Set status to "active", used_amount to 0
- Generate advance numbers using existing RPC function

### 3. Add Import Button to Customer Master

Update `src/pages/CustomerMaster.tsx`:
- Add "Import Balances" button next to existing Excel Import button
- Open the new import dialog

---

## Matching Strategy

```text
Excel: +91-9391317936  →  normalizePhoneNumber()  →  9391317936
DB:    9391317936      →  Direct match
```

- Uses existing `normalizePhoneNumber()` utility
- Strips country codes, dashes, spaces
- Extracts last 10 digits for comparison

---

## Files to Create/Modify

| File | Action |
|------|--------|
| `src/components/CustomerBalanceImportDialog.tsx` | **Create** - New dialog component |
| `src/pages/CustomerMaster.tsx` | **Modify** - Add import button |
| `src/utils/excelImportUtils.ts` | **Modify** - Add balance import field definitions |

---

## User Interface Preview

```text
┌─────────────────────────────────────────────────────────┐
│  Import Customer Balances & Advances                    │
├─────────────────────────────────────────────────────────┤
│  ┌─────────────────────────────────────────────────────┐│
│  │  📁 Upload Excel File                               ││
│  │  (Must contain sheets named "Bal" and "Adv")        ││
│  └─────────────────────────────────────────────────────┘│
│                                                         │
│  📊 Sheet: Bal (Outstanding)          ✓ 137 customers   │
│     - Matched: 130                                      │
│     - Not found: 7                                      │
│                                                         │
│  📊 Sheet: Adv (Advances)             ✓ 402 customers   │
│     - Matched: 385                                      │
│     - Not found: 17                                     │
│                                                         │
│  Preview:                                               │
│  ┌────────────────┬─────────────┬───────────┬─────────┐│
│  │ Customer       │ Phone       │ Amount    │ Status  ││
│  ├────────────────┼─────────────┼───────────┼─────────┤│
│  │ Aaisha Parekh  │ 9391317936  │ ₹500      │ ✓ Found ││
│  │ Aa Production  │ 9833714507  │ ₹19,500   │ ✓ Found ││
│  └────────────────┴─────────────┴───────────┴─────────┘│
│                                                         │
│  [Cancel]                            [Import Balances]  │
└─────────────────────────────────────────────────────────┘
```

---

## Technical Details

### Customer Balance Update Logic
```typescript
// For each row in "Bal" sheet
const normalizedPhone = normalizePhoneNumber(row.phone);
const customer = customers.find(c => 
  normalizePhoneNumber(c.phone) === normalizedPhone
);

if (customer) {
  await supabase
    .from('customers')
    .update({ opening_balance: closingBalance })
    .eq('id', customer.id);
}
```

### Advance Creation Logic
```typescript
// For each row in "Adv" sheet  
const advanceAmount = Math.abs(closingBalance); // Convert negative to positive

const advanceNumber = await supabase.rpc(
  'generate_advance_number',
  { p_organization_id: organizationId }
);

await supabase
  .from('customer_advances')
  .insert({
    organization_id: organizationId,
    customer_id: customer.id,
    advance_number: advanceNumber,
    amount: advanceAmount,
    used_amount: 0,
    advance_date: format(new Date(), 'yyyy-MM-dd'),
    payment_method: 'Excel Import',
    description: 'Imported from Excel',
    status: 'active'
  });
```

---

## Safety Features

1. **Preview before import** - Show matched/unmatched customers before processing
2. **Batch processing** - Process 50 records at a time to avoid timeouts
3. **Progress tracking** - Show real-time progress bar during import
4. **Error handling** - Skip failed records, continue with rest
5. **Duplicate prevention** - Check if advance already exists for customer before creating
6. **Confirmation dialog** - Require explicit confirmation before updating balances

---

## Post-Import Verification

After import, query results will show:
- Number of customers with updated `opening_balance`
- Number of new `customer_advances` records created
- List of unmatched phone numbers for manual review
