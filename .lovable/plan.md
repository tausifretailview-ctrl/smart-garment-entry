
# Plan: Fix Customer Duplicate Prevention Across All Entry Points

## Problem Identified
The screenshot shows two customers with the same phone number:
- `Anil Thomas` with phone `919819082836` (with country code)
- `Anil Thomas` with phone `9819082836` (without country code)

These are **the same phone number** but were allowed to be created because duplicate prevention is inconsistent across the application.

## Root Cause Analysis
| Entry Point | Has Duplicate Check? | Uses Normalized Phone? |
|-------------|---------------------|------------------------|
| CustomerMaster.tsx (Manual) | Yes | Yes (normalizePhoneNumber) |
| CustomerMaster.tsx (Excel Import) | Yes | Yes |
| POSSales.tsx | Yes | **No** (exact match) |
| SalesInvoice.tsx | Yes | **No** (exact match) |
| DeliveryChallanEntry.tsx | **No** | N/A |
| QuotationEntry.tsx | **No** | N/A |
| SaleOrderEntry.tsx | **No** | N/A |
| QuickAddCustomerDialog.tsx (Mobile) | **No** | N/A |

## Solution

### Part 1: Create Reusable Customer Creation Utility
Create a shared utility function that handles customer creation with proper duplicate prevention using normalized phone matching.

**New file: `src/utils/customerUtils.ts`**
- `createOrGetCustomer()` - Checks for existing customer by normalized phone, returns existing or creates new
- Centralizes the duplicate check logic
- Uses `normalizePhoneNumber()` from excelImportUtils

### Part 2: Update All Customer Creation Points

**Files to modify:**
1. **POSSales.tsx** - Replace exact match with normalized check
2. **SalesInvoice.tsx** - Replace exact match with normalized check  
3. **DeliveryChallanEntry.tsx** - Add duplicate check using normalized phone
4. **QuotationEntry.tsx** - Add duplicate check using normalized phone
5. **SaleOrderEntry.tsx** - Add duplicate check using normalized phone
6. **QuickAddCustomerDialog.tsx** - Add duplicate check using normalized phone

### Part 3: Store Normalized Phone in Database
Ensure all customer creation stores the **normalized** phone number (last 10 digits) instead of the raw input. This ensures consistency:
- `919819082836` → `9819082836`
- `9819082836` → `9819082836`
- `+91-9819082836` → `9819082836`

### Part 4: Data Cleanup (Optional Query)
Provide a query to identify and merge existing duplicate customers that slipped through.

---

## Technical Implementation Details

### Step 1: Create Customer Utility (`src/utils/customerUtils.ts`)
```typescript
import { supabase } from "@/integrations/supabase/client";
import { normalizePhoneNumber } from "./excelImportUtils";

export interface CreateCustomerParams {
  customer_name?: string;
  phone: string;
  email?: string;
  address?: string;
  gst_number?: string;
  organization_id: string;
  opening_balance?: number;
  discount_percent?: number;
}

export interface CreateCustomerResult {
  customer: Customer;
  isExisting: boolean;
}

export async function createOrGetCustomer(params: CreateCustomerParams): Promise<CreateCustomerResult> {
  const normalizedPhone = normalizePhoneNumber(params.phone);
  
  if (!normalizedPhone) {
    throw new Error("Valid phone number is required");
  }
  
  // Fetch all customers and check with normalized phone
  const { data: existingCustomers, error: checkError } = await supabase
    .from("customers")
    .select("*")
    .eq("organization_id", params.organization_id)
    .is("deleted_at", null);
  
  if (checkError) throw checkError;
  
  // Find duplicate by normalized phone
  const existing = existingCustomers?.find(c => 
    normalizePhoneNumber(c.phone) === normalizedPhone
  );
  
  if (existing) {
    return { customer: existing, isExisting: true };
  }
  
  // Create new customer with NORMALIZED phone
  const customerData = {
    customer_name: params.customer_name?.trim() || normalizedPhone,
    phone: normalizedPhone, // Store normalized
    email: params.email || null,
    address: params.address || null,
    gst_number: params.gst_number || null,
    opening_balance: params.opening_balance || 0,
    discount_percent: params.discount_percent || 0,
    organization_id: params.organization_id,
  };
  
  const { data: newCustomer, error } = await supabase
    .from("customers")
    .insert([customerData])
    .select()
    .single();
    
  if (error) throw error;
  
  return { customer: newCustomer, isExisting: false };
}
```

### Step 2: Update POSSales.tsx (lines ~2180-2206)
Replace the existing `createCustomer` mutation to use the utility and normalize phone.

### Step 3: Update SalesInvoice.tsx (lines ~1188-1246)
Replace `handleCreateCustomer` to use normalized phone matching.

### Step 4: Update DeliveryChallanEntry.tsx (lines ~488-512)
Add duplicate check before insert using normalized phone.

### Step 5: Update QuotationEntry.tsx (lines ~634-658)
Add duplicate check before insert using normalized phone.

### Step 6: Update SaleOrderEntry.tsx (lines ~779-804)
Add duplicate check before insert using normalized phone.

### Step 7: Update QuickAddCustomerDialog.tsx (lines ~51-103)
Add duplicate check before insert using normalized phone.

---

## Expected Result
After implementation:
- All customer creation points will check for duplicates using **normalized phone numbers**
- Phone numbers will be stored in **consistent format** (10-digit Indian mobile)
- Users will see "Customer already exists" message instead of creating duplicates
- The existing duplicate (Anil Thomas) can be manually merged by deleting one record

## Files to Create/Modify
| File | Action |
|------|--------|
| `src/utils/customerUtils.ts` | **Create** - Centralized customer creation utility |
| `src/pages/POSSales.tsx` | Modify - Use normalized phone check |
| `src/pages/SalesInvoice.tsx` | Modify - Use normalized phone check |
| `src/pages/DeliveryChallanEntry.tsx` | Modify - Add duplicate check |
| `src/pages/QuotationEntry.tsx` | Modify - Add duplicate check |
| `src/pages/SaleOrderEntry.tsx` | Modify - Add duplicate check |
| `src/components/mobile/QuickAddCustomerDialog.tsx` | Modify - Add duplicate check |
