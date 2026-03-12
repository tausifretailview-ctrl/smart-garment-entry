

## Plan: ESC/POS Thermal Bill Printing via WebUSB

### Overview
5 deliverables: ESC/POS command generator, React hook, POSSales integration, POSDashboard reprint, Settings info card.

### 1. Create `src/utils/escPosPrint.ts`
ESC/POS command generator for 80mm/58mm thermal receipt printers. Builds raw byte strings with:
- Init, alignment, bold, double-height text commands
- Structured receipt layout: business header → bill info → customer → items table → totals → payment breakdown → footer
- Cash drawer kick commands (pin2/pin5)
- Paper cut command
- 48-char width (80mm) or 32-char (58mm) modes
- Types: `EscPosReceiptData`, `EscPosReceiptItem`

### 2. Create `src/hooks/useEscPosPrint.ts`
React hook wrapping `webUsbPrint.ts` + `escPosPrint.ts`:
- Same connection management as `useWebUsbPrint` but with a `printReceipt(data)` method that generates ESC/POS commands from receipt data
- localStorage flag `ezzy_usb_thermal_receipt_enabled` to remember preference
- Toast notifications for connect/disconnect/print

### 3. Modify `src/pages/POSSales.tsx`
- **Line 80**: Add imports for `useEscPosPrint` and `EscPosReceiptData`
- **Line 221**: Add `useEscPosPrint()` hook call after `useCashDrawer()`
- **After line 1975** (after `getPageStyle`): Add `buildEscPosReceiptData()` helper that maps current sale state to `EscPosReceiptData`
- **Line 1717** (auto-print block): Insert USB ESC/POS check BEFORE the existing `isDirectPrintEnabled && isAutoPrintEnabled` block — if USB connected and thermal format, print via USB and return early; fall through on failure
- **Line 2008** (`handlePrintFromDialog`): Insert USB ESC/POS check BEFORE the existing QZ Tray block at line 2012
- **Line 2936** (after Print button): Add USB status chip — green "USB Printer" badge when connected, "Connect Printer" button when not

### 4. Modify `src/pages/POSDashboard.tsx`
- **Line 44**: Add imports for `useEscPosPrint` and `EscPosReceiptData`
- **Line 137**: Add `useEscPosPrint()` hook call after `invoicePrintRef`
- **Line 572** (inside `handlePrintClick`, before `handlePrint()`): Insert USB check — build `EscPosReceiptData` from `invoiceData` and `sale`, call `printUsbReceipt()`, skip browser print if successful
- Add USB status chip near the page header/toolbar area

### 5. Modify `src/pages/Settings.tsx`
- **Line 3607** (before the QZ Tray card): Insert a new informational card "USB Direct Receipt Printing" with setup instructions (5 steps), compatibility notes, and a disclaimer about text-based vs styled receipts

### Technical notes
- All changes are purely additive — existing QZ Tray and browser print paths are untouched
- USB path is only attempted when `isUsbReceiptConnected && posBillFormat === 'thermal'`
- On USB failure, falls through to existing print paths seamlessly
- No database changes needed

