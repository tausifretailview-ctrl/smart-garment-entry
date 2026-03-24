

## Fix: Allow "1" Key Shortcut Except in Supplier Invoice Number Field

### Problem
Currently the "1" key shortcut to open Add New Product dialog is blocked in ALL input fields. The user wants it to work in all inputs EXCEPT the supplier invoice number field, since that field commonly contains the digit "1".

### Solution
Change the guard logic: instead of blocking the shortcut in any input, only block it when the focused element is the supplier invoice number input. Identify that field by checking if the focused input's value matches `billData.supplier_invoice_no` or by adding a `data-field` attribute to that specific input.

### Technical Change

**File: `src/pages/PurchaseEntry.tsx`** (lines 1560-1568)

Replace the current input-field guard with a targeted check:

```typescript
// Press "1" key to open Add New Product dialog — block only in supplier invoice field
if (e.key === "1" && !showProductDialog) {
  const active = document.activeElement as HTMLInputElement;
  const isSupplierInvField = active?.getAttribute('data-field') === 'supplier-invoice-no';
  if (!isSupplierInvField) {
    e.preventDefault();
    setShowProductDialog(true);
  }
}
```

Also add `data-field="supplier-invoice-no"` attribute to the supplier invoice number `<Input>` element (line ~2609):

```tsx
<Input 
  data-field="supplier-invoice-no"
  value={billData.supplier_invoice_no} 
  onChange={(e) => setBillData({ ...billData, supplier_invoice_no: e.target.value })} 
  placeholder="Inv #" 
  className="h-9 text-sm rounded-xl" 
/>
```

This way, pressing "1" opens the dialog from anywhere (including search bar, other inputs) except the supplier invoice number field.

