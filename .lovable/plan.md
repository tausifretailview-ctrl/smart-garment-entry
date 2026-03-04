

## Plan: Add "Estimate Print" Button to POS Top Bar

### What it does
Allows printing a draft/estimate invoice (without saving to database) so the customer can verify products and quantities before the actual payment and final invoice save. This is a common retail workflow for customer verification.

### Changes

**1. POSContext (`src/contexts/POSContext.tsx`)**
- Add `onEstimatePrint` callback and `setOnEstimatePrint` setter to the context

**2. POSLayout (`src/components/POSLayout.tsx`)**
- Add an "Estimate" button in the top bar (between Clear and Save Changes), with `FileText` icon
- Show it only when cart has items (`hasItems`) and not in editing mode
- Tooltip: "Print Estimate (without saving) — F9"

**3. POSSales (`src/pages/POSSales.tsx`)**
- Create `handleEstimatePrint` function that:
  - Builds `invoiceDataForPrint` from current cart state (same structure as saved invoice data) but with invoice number showing "ESTIMATE" or the current preview number
  - Sets `savedInvoiceData` with this estimate data and marks it as estimate
  - Triggers browser print via `useReactToPrint` (or direct print if configured)
  - Does NOT save to database, does NOT clear the cart, does NOT modify stock
  - After print, clears `savedInvoiceData` but keeps cart intact
- Register `onEstimatePrint` in POSContext via `setOnEstimatePrint`
- Add **F9** keyboard shortcut to trigger estimate print

**4. KeyboardShortcutsModal (`src/components/KeyboardShortcutsModal.tsx`)**
- Add `{ keys: ["F9"], description: "Print Estimate (no save)" }` to POS shortcuts

**5. Invoice rendering**
- When printing estimate, add a visible "ESTIMATE" watermark/header text on the printed invoice to distinguish it from final invoices
- Reuse the existing `InvoiceWrapper` and `invoicePrintRef` for rendering

### Keyboard Shortcut
- **F9** — Print Estimate (available, not currently assigned)

### Key Behavior
- Cart remains intact after estimate print (no form reset)
- No database write, no stock movement, no payment recorded
- Invoice clearly marked as "ESTIMATE" on print
- Works with both browser print and QZ Tray direct print

