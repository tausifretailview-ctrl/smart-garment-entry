
## Status: None of the 3 Fixes Are Done Yet

The barcode label fix (last diff) was applied, but that was a separate task. The cloud cost reduction plan fixes are still pending. Here is the current state and what needs to be done for each:

---

### Fix 1 — batch_stock FIFO Performance Index
**Status: NOT DONE**

The only existing batch_stock indexes are:
- `idx_batch_stock_organization_id` (on organization_id)
- `idx_batch_stock_variant` (on variant_id)
- `idx_batch_stock_bill_number` (on bill_number)
- `idx_batch_stock_purchase_date` (on purchase_date)

Missing: The partial index `idx_batch_stock_variant_qty` on `(variant_id, purchase_date) WHERE quantity > 0` that accelerates FIFO lookups by excluding zero-quantity rows entirely.

**Action**: Run a database migration to create:
```sql
CREATE INDEX IF NOT EXISTS idx_batch_stock_variant_qty 
ON public.batch_stock(variant_id, purchase_date) 
WHERE quantity > 0;
```

---

### Fix 2 — Sale Delete Confirmation Guard (Item Count)
**Status: PARTIALLY DONE — message is generic, no item count shown**

Current delete dialog text in both `SalesInvoiceDashboard.tsx` (line 1712) and `POSDashboard.tsx` (line 1842) says:

> "Are you sure you want to delete invoice {sale_number}? Stock quantities will be restored. This action cannot be undone."

This is missing the specific item count. The plan requires showing exactly how many stock movements will be reversed (e.g., "This will reverse **12 stock movements** across 6 products").

**What needs to change:**
- Add a state variable `itemCountToDelete` that gets populated when the delete button is clicked (query `sale_items` count for that sale_id)
- Update the dialog description in both `SalesInvoiceDashboard.tsx` and `POSDashboard.tsx` to include the item count
- For bulk delete (5+ invoices), show a warning: "Warning: You are deleting X invoices. This will reverse stock for Y total items."

---

### Fix 3 — WhatsApp PDF Minimum Amount Threshold
**Status: NOT DONE**

No trace of `whatsapp_pdf_min_amount` anywhere in the codebase. The PDF generation in `useSaveSale.tsx` (lines 461–526) currently:
1. Checks only `whatsappSettings.use_document_header_template && whatsappSettings.invoice_document_template_name`
2. If true, **always** generates a base64 PDF regardless of sale amount

Missing: A threshold check like `saleData.netAmount >= (whatsappSettings.pdf_min_amount ?? 0)` before entering the PDF generation block.

**What needs to change:**
1. **Database**: Add `pdf_min_amount numeric DEFAULT 0` column to `whatsapp_api_settings` table
2. **`useSaveSale.tsx`**: Add threshold guard: only generate PDF if `netAmount >= pdf_min_amount`
3. **`WhatsAppAPISettings.tsx`**: Add a "Minimum sale amount for PDF attachment" input field (default 0 = always send)

---

## Implementation Plan

### Step 1 — Database Migration (2 changes in 1 migration)
```sql
-- Performance index for FIFO batch_stock queries
CREATE INDEX IF NOT EXISTS idx_batch_stock_variant_qty 
ON public.batch_stock(variant_id, purchase_date) 
WHERE quantity > 0;

-- WhatsApp PDF threshold column
ALTER TABLE whatsapp_api_settings 
ADD COLUMN IF NOT EXISTS pdf_min_amount numeric DEFAULT 0;
```

### Step 2 — `src/pages/SalesInvoiceDashboard.tsx`
- Add `itemCountToDelete: number | null` state
- Before opening delete dialog, fetch `count` from `sale_items` where `sale_id = invoice.id`
- Update dialog description:
  > "Deleting invoice {sale_number} will reverse **{N} stock movement(s)** across {N} products. This action cannot be undone."
- For bulk delete > 5 invoices: add a red warning badge: "High Impact: Deleting X invoices"

### Step 3 — `src/pages/POSDashboard.tsx`
- Same item count fetch and dialog update as SalesInvoiceDashboard

### Step 4 — `src/hooks/useSaveSale.tsx`
- In the WhatsApp settings fetch query, add `pdf_min_amount` to the select list
- Add guard before PDF generation block (line ~461):
  ```typescript
  const shouldSendPdf = shouldSendPdfFlow && 
    (saleData.netAmount >= (whatsappSettings.pdf_min_amount ?? 0));
  if (shouldSendPdf) { ... }
  ```

### Step 5 — `src/components/WhatsAppAPISettings.tsx`
- Add a new labeled input in the PDF/Document template section:
  - Label: "Minimum sale amount for PDF attachment (₹)"
  - Placeholder: "0 (always send PDF)"
  - Saves to `pdf_min_amount` column

---

## Files to Modify

| File | Change |
|---|---|
| Database migration | Add `idx_batch_stock_variant_qty` partial index + `pdf_min_amount` column |
| `src/pages/SalesInvoiceDashboard.tsx` | Fetch item count on delete, show in confirmation dialog |
| `src/pages/POSDashboard.tsx` | Same item count guard for POS delete |
| `src/hooks/useSaveSale.tsx` | PDF threshold guard using `pdf_min_amount` |
| `src/components/WhatsAppAPISettings.tsx` | Add `pdf_min_amount` setting input |
