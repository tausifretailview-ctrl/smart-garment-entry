

# Fix Invoice Quantity Duplication on Edit

## Problem Summary

When editing a Sales Invoice in the BCCS organization, quantities are increasing incorrectly after modification. The issue is that stock movements show duplicate deductions without corresponding restorations.

---

## Root Cause Analysis

The bug is in `src/pages/SalesInvoice.tsx` at **line 514**:

```javascript
// WRONG: useState callback only runs ONCE during initial mount
useState(() => {
  const invoiceData = location.state?.invoiceData;
  if (invoiceData) {
    setEditingInvoiceId(invoiceData.id);
    // ... set other states
    setOriginalItemsForEdit(invoiceData.sale_items.map(...));
  }
});
```

### Why This Breaks

| Step | What Happens | Problem |
|------|--------------|---------|
| 1 | User clicks Edit on Invoice A | Component mounts, `useState` callback runs, `originalItemsForEdit` set correctly |
| 2 | User saves Invoice A | Stock deleted + inserted correctly (balanced) |
| 3 | User returns to dashboard | Component may not fully unmount (React Router / tab caching) |
| 4 | User clicks Edit on Invoice A again | If component is already mounted, `useState` callback does NOT run again |
| 5 | User saves Invoice A again | `originalItemsForEdit` is stale - stock validation uses old data, but database operations happen with new data |

The `useState` callback is designed to compute initial state once - it's **not** meant for side effects triggered by navigation changes.

---

## Evidence from Database

Stock movements for INV/25-26/15 show:
- Multiple `sale` deductions (-1534 total)
- Fewer `sale_delete` restorations (+796 total)
- Net loss of 738 units over multiple edit cycles

Updates without corresponding deletions:
- `2026-01-30 10:57:19`: -332 units (no `sale_delete`)
- `2026-01-29 12:56:58`: -47 units (no `sale_delete`)
- `2026-01-28 11:49:59`: -318 units (no `sale_delete`)

---

## Solution

Convert the `useState` callback to a proper `useEffect` that:
1. Watches for changes to `location.state?.invoiceData`
2. Always re-initializes form state when invoice data changes
3. Properly sets `originalItemsForEdit` for accurate stock validation

---

## Implementation

### File: `src/pages/SalesInvoice.tsx`

**Current Code (lines 513-572):**
```javascript
// Pre-populate form if editing existing invoice
useState(() => {
  const invoiceData = location.state?.invoiceData;
  if (invoiceData) {
    setEditingInvoiceId(invoiceData.id);
    // ... all the state setting
  }
});
```

**Fixed Code:**
```javascript
// Pre-populate form if editing existing invoice
useEffect(() => {
  const invoiceData = location.state?.invoiceData;
  if (invoiceData) {
    setEditingInvoiceId(invoiceData.id);
    setInvoiceDate(new Date(invoiceData.sale_date));
    setDueDate(invoiceData.due_date ? new Date(invoiceData.due_date) : new Date());
    setSelectedCustomerId(invoiceData.customer_id || "");
    
    // Set customer if available
    if (invoiceData.customer_id) {
      const customer = {
        id: invoiceData.customer_id,
        customer_name: invoiceData.customer_name,
        phone: invoiceData.customer_phone,
        email: invoiceData.customer_email,
        address: invoiceData.customer_address,
      };
      setSelectedCustomer(customer);
    }
    
    setPaymentTerm(invoiceData.payment_term || "");
    setTermsConditions(invoiceData.terms_conditions || "");
    setNotes(invoiceData.notes || "");
    setShippingAddress(invoiceData.shipping_address || "");
    setShippingInstructions(invoiceData.shipping_instructions || "");
    setSalesman(invoiceData.salesman || "");
    setFlatDiscountPercent(invoiceData.flat_discount_percent || 0);
    setFlatDiscountRupees(invoiceData.flat_discount_amount || 0);
    setRoundOff(invoiceData.round_off || 0);
    
    // Transform sale items back to line items
    if (invoiceData.sale_items && invoiceData.sale_items.length > 0) {
      const transformedItems = invoiceData.sale_items.map((item: any) => ({
        id: item.id,
        productId: item.product_id,
        variantId: item.variant_id,
        productName: item.product_name,
        size: item.size,
        barcode: item.barcode || '',
        color: item.color || '',
        quantity: item.quantity,
        mrp: item.mrp,
        salePrice: item.unit_price,
        discountPercent: item.discount_percent,
        discountAmount: 0,
        gstPercent: item.gst_percent,
        lineTotal: item.line_total,
        hsnCode: item.hsn_code || '',
      }));
      setLineItems(transformedItems);
      
      // Store original items for stock validation in edit mode
      setOriginalItemsForEdit(invoiceData.sale_items.map((item: any) => ({
        variantId: item.variant_id,
        quantity: item.quantity,
      })));
    }
  }
}, [location.state?.invoiceData]);
```

---

## Why This Fix Works

| Aspect | Before (useState) | After (useEffect) |
|--------|-------------------|-------------------|
| **Runs on mount** | Yes (once) | Yes (once) |
| **Runs on navigation with new data** | No | Yes |
| **Dependency tracking** | None | Tracks `location.state?.invoiceData` |
| **originalItemsForEdit accuracy** | Stale on re-edit | Always fresh |

---

## Files to Modify

| File | Change |
|------|--------|
| `src/pages/SalesInvoice.tsx` | Convert `useState` callback (lines 513-572) to `useEffect` with `[location.state?.invoiceData]` dependency |

---

## Verification Steps

After implementation:
1. Create a new invoice for BCCS organization
2. Edit the invoice and change quantities
3. Save the invoice
4. Edit the same invoice again
5. Save without changes
6. Check stock movements - should show balanced delete/insert pairs
7. Verify product stock quantities remain correct

