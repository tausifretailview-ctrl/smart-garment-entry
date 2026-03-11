

## Plan: WebUSB Direct Print + Perfect PDF for Barcode Printing

### Overview
4 deliverables: WebUSB utility, React hook, DirectPrintDialog USB transport, and pdf-lib A4 label PDF generator.

### 1. Create `src/utils/webUsbPrint.ts`
- WebUSB utility with `connectUsbPrinter()`, `disconnectUsbPrinter()`, `printViaWebUsb()`, `isWebUsbSupported()`
- Uses USB Printer class filter (`classCode: 0x07`), auto-discovers OUT endpoint
- Sends TSPL commands in 4096-byte chunks via `transferOut()`
- Handles disconnection detection and user cancellation gracefully

### 2. Create `src/hooks/useWebUsbPrint.ts`
- React hook wrapping the utility with state: `isConnected`, `isConnecting`, `isPrinting`, `printerName`
- Exposes `connect()`, `disconnect()`, `print(tsplCommands)` with toast notifications
- Auto-restores connection state on mount if device still connected

### 3. Modify `src/components/DirectPrintDialog.tsx`
- Add imports: `useWebUsbPrint` hook and `Usb` icon from lucide-react
- Add `printTransport` state (`'qz' | 'usb'`), default `'qz'`
- **Replace lines 468-521** (Connection Status + QZ Not Installed sections) with:
  - Transport selector: two cards ("USB Direct — No install needed" / "QZ Tray — Requires install")
  - USB panel: browser support check → connect button → connected status with disconnect
  - QZ panel: existing connection UI preserved exactly, wrapped in `printTransport === 'qz'` conditional
- **Wrap lines 523-end of printer select section** in `printTransport === 'qz' && isConnected && (...)` 
- **Update `handlePrint` (lines 355-451)**: after building `commandsToSend`, branch on `printTransport`:
  - `'usb'`: call `printUsb(commandsToSend)` — no printer selection needed
  - `'qz'`: existing `printRaw()` path with selectedPrinter check
- **Update Print button (line 869-884)**: 
  - `disabled` condition: `(printTransport === 'usb' ? !isUsbConnected : (!isConnected || !selectedPrinter)) || isPrinting || isUsbPrinting || items.length === 0`
  - Label: `printTransport === 'usb' ? '⚡ USB Print' : 'Print'` + totalLabels

### 4. Install `pdf-lib` dependency
- Add `"pdf-lib": "^1.17.1"` to package.json dependencies

### 5. Create `src/utils/a4LabelPdf.ts`
- Uses `pdf-lib` to generate precise PDF with mm-to-point conversion
- Renders labels in grid layout on A4 pages (210×297mm)
- Draws text fields from `LabelDesignConfig.fieldOrder` using `StandardFonts.Helvetica`/`HelveticaBold`
- Renders barcodes via JsBarcode → canvas → PNG → embedded as PDF image
- Expands items by qty, paginates into `cols × rows` per page
- Returns `Uint8Array` for blob creation

### 6. Modify `src/pages/BarcodePrinting.tsx`
- Add import: `generateA4LabelPdf` from `@/utils/a4LabelPdf`
- Add `handleExportPerfectPDF` function after existing `handleExportPDF` — calls the utility with current `sheetPresets[sheetType]` dimensions, offsets, and `labelConfig`; opens result as blob URL
- **At line 4722** (after Export PDF button): add conditional "Perfect PDF ✨" button shown only when `!isThermal1Up()`, styled with purple theme

### Technical notes
- WebUSB works only in Chrome/Edge (shown in UI warning)
- pdf-lib generates real vector PDF — no html2canvas dependency, exact coordinates
- Existing QZ Tray functionality is completely preserved — USB is an additive option
- No database changes needed

