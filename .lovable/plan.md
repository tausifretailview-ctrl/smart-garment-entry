# Remove QZ Tray bridge (frontend only)

The app currently loads `qz-tray.min.js` from CDN in `index.html` and auto-connects to `wss://localhost:8181-8484` on mount via `useQZTray.ts`. Since QZ is no longer used, this floods the console with WebSocket errors. Goal: eliminate every connection attempt while keeping the working browser/jsPDF/Electron print path intact.

## Changes

### 1. `index.html`
Remove the QZ Tray CDN `<script>` tag (line ~127). Nothing else in `<head>`/`<body>` depends on `window.qz` at parse time.

### 2. `src/hooks/useQZTray.ts` — convert to no-op stub
Replace the implementation with a stub that preserves the same exported shape (so `DirectPrintDialog`, `useCashDrawer`, `Settings` keep compiling) but:
- `isQZAvailable` → always `false`
- `isConnected/isConnecting` → always `false`, `printers: []`, `selectedPrinter: null`
- `connect()` / `getPrinters()` / `findThermalPrinters()` / `printRaw()` → return `false`/`[]` immediately, **no WebSocket open, no retries, no `setTimeout` auto-connect**
- Remove the mount `useEffect` that calls `connect()` + `getPrinters()` — this is the actual source of the `wss://localhost` errors on every page load
- `selectPrinter()` becomes a no-op

### 3. `src/utils/directInvoicePrint.ts` — neutralize
- `waitForQZ()` → resolve `false` immediately (no polling for `window.qz`)
- `isQZReady()` → `false`
- `ensureQZConnection()` → `false` (no `qz.websocket.connect`)
- `getQZPrinters()` → `[]`
- `printViaQZTray()` → return `false` and log a debug message; callers already fall back to browser print
- Keep `testDirectPrint`/exports intact (returns `false`)

### 4. `src/hooks/useDirectPrint.ts` — simplify guard
The QZ branch (lines ~117–150) currently calls `ensureQZConnection()`. With stubs above it already returns `false` and falls through to the browser-print path, but to avoid the warning toast on every print, short-circuit: when `isQzDirectPrintEnabled`, skip the QZ block entirely and let Electron-silent / browser print handle it. **No change to Electron path, browser print path, jsPDF, label/barcode/thermal/@page CSS.**

### 5. `src/hooks/useCashDrawer.ts`
No code change needed — it calls `qzTray.connect()` / `printRaw()` which now return `false`; user gets a friendly toast instead of a WebSocket attempt. (Cash drawer was QZ-only; opening it from POS already shows a toast on failure.)

### 6. `src/components/DirectPrintDialog.tsx` + `src/pages/Settings.tsx`
No structural change. They'll show "QZ Tray Disconnected / Not available" UI as before — but since the stubs never open a socket, there are zero console errors. (Optional cleanup of these UIs is out of scope per "frontend only / minimal" goal.)

## Out of scope (untouched)
- `src/utils/thermalReceiptPrintDocument.ts`, `src/utils/invoicePrintFormat.ts`, `src/utils/webUsbPrint.ts` — only contain QZ in comments, no runtime calls
- All jsPDF / `window.print()` / `@page` / barcode-layout / Electron `appPrint` code
- `package.json` — no `qz-tray` npm dep exists (it was CDN-only), nothing to remove
- Migrations, backend, edge functions

## Verification
1. Hard reload `/demo/purchase-bills` → DevTools console shows no `WebSocket connection to 'wss://localhost:818…'` errors and no `qz-tray.js` 404/network entries.
2. Print a sale invoice from `SalesInvoice` → browser print dialog opens as before.
3. Print barcode labels from `BarcodePrinting` → A4 / thermal output unchanged.
4. Settings → "Direct Printing" shows QZ as unavailable without retrying.
