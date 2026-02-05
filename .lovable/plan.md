

# Fix: Customer Ledger Showing Incorrect "Advance" Balance

## Problem Identified

When a user selects multiple invoices for payment in Accounts → Customer Payment, the system:
1. **Correctly** updates `paid_amount` on ALL selected invoices (distributed proportionally)
2. **Incorrectly** creates only ONE voucher_entry that references only the FIRST invoice

This causes the balance calculation to double-count payments:
- The voucher amount (₹27,731) is compared against only the first invoice
- Other invoices also have their `paid_amount` counted
- Result: ₹50,609 counted as paid instead of ₹27,731

## Root Cause Location

**File**: `src/pages/Accounts.tsx` (Lines 820-828)

```typescript
if (invoicesToProcess.length > 0) {
  // BUG: Only references the FIRST invoice!
  finalReferenceType = 'sale';
  finalReferenceId = invoicesToProcess[0];
}
```

## Solution

Create separate voucher entries for each invoice when multiple invoices are selected, OR change the balance calculation to handle multi-invoice vouchers correctly.

**Recommended Fix**: Create separate voucher entries for each processed invoice with the actual amount applied to that invoice.

---

## Implementation Details

### Option A: Create Separate Voucher per Invoice (Recommended)

Modify `src/pages/Accounts.tsx` to create individual voucher entries for each invoice processed:

```typescript
// After processing all invoices, create individual vouchers
for (const processed of processedInvoices) {
  await supabase.from("voucher_entries").insert({
    organization_id: currentOrganization?.id,
    voucher_number: voucherNumber + '-' + (index + 1), // e.g., RCP/25-26/152-1
    voucher_type: voucherType,
    voucher_date: format(voucherDate, "yyyy-MM-dd"),
    reference_type: 'sale',
    reference_id: processed.invoice.id,
    description: `Payment for ${processed.invoice.sale_number}`,
    total_amount: processed.amountApplied,
  });
}
```

### Option B: Fix Balance Calculation Logic

If we keep one voucher for multiple invoices, the balance calculation must NOT use `Math.max()`. Instead:

1. For invoices with `reference_type='sale'` voucher → use voucher amount only
2. For invoices without voucher → use `paid_amount`

This requires changing logic in:
- `src/hooks/useCustomerBalance.tsx`
- `src/components/CustomerLedger.tsx`
- `src/hooks/useCustomerSearch.tsx`

---

## Fixing Existing Data

The Janata Footwear data needs a corrective entry. Since ₹27,731 voucher was created but invoices already have correct `paid_amount`, options are:

1. **Delete the voucher** - The `paid_amount` fields are already correct
2. **Split the voucher** - Create 6 vouchers matching the `paid_amount` on each invoice

### SQL to Verify Affected Records

```sql
-- Find vouchers where total_amount > referenced invoice net_amount
SELECT ve.*, s.sale_number, s.net_amount, s.paid_amount
FROM voucher_entries ve
JOIN sales s ON ve.reference_id = s.id
WHERE ve.total_amount > s.net_amount
AND ve.reference_type = 'sale';
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Accounts.tsx` | Create separate voucher entries per invoice when multiple selected |
| `src/hooks/useCustomerBalance.tsx` | Improve logic to handle edge cases |
| `src/components/CustomerLedger.tsx` | Improve balance calculation for multi-invoice payments |

---

## Technical Implementation

### Modified Voucher Creation (Accounts.tsx)

Instead of creating one voucher referencing just the first invoice, create a voucher for each processed invoice:

```typescript
// Create voucher entries for EACH processed invoice
const createdVouchers = [];
for (let i = 0; i < processedInvoices.length; i++) {
  const processed = processedInvoices[i];
  const invoiceVoucherNumber = processedInvoices.length > 1 
    ? `${voucherNumber}-${i + 1}`  // RCP/25-26/152-1, RCP/25-26/152-2, etc.
    : voucherNumber;

  const { data: voucher, error: voucherError } = await supabase
    .from("voucher_entries")
    .insert({
      organization_id: currentOrganization?.id,
      voucher_number: invoiceVoucherNumber,
      voucher_type: voucherType,
      voucher_date: format(voucherDate, "yyyy-MM-dd"),
      reference_type: 'sale',
      reference_id: processed.invoice.id,
      description: `Payment for ${processed.invoice.sale_number}${paymentDetails}`,
      total_amount: processed.amountApplied,
      discount_amount: i === 0 ? discountValue : 0, // Apply discount to first only
      discount_reason: i === 0 ? discountReason : null,
    })
    .select()
    .single();

  if (voucherError) throw voucherError;
  createdVouchers.push(voucher);
}
```

### Data Fix for Janata Footwear

Delete the incorrect voucher and let the `paid_amount` values serve as the payment record:

```sql
-- Delete the problematic voucher (since paid_amount is already correct)
UPDATE voucher_entries 
SET deleted_at = NOW() 
WHERE id = '4e2a1e57-c505-442e-a1aa-04382fc24341';
```

Or create proper split vouchers matching actual paid amounts.

---

## Verification After Fix

After implementation:
- Total Sales: ₹43,692
- Total Paid: ₹27,731 (from paid_amount OR vouchers, not both)
- Balance: ₹15,961 (Outstanding, not Advance)

