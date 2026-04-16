
## What I found

This looks like a frontend barcode-input race condition, not a stock/data issue.

I checked the Ella Noor data:
- barcode `90002773` exists, active, stock `1`
- barcode `90002939` exists, active, stock `1`

So the product is in the backend. The intermittent failure is most likely happening in the UI event flow.

## Root cause

There are 4 likely causes in the billing screens:

1. **Barcode submit uses React state instead of the live input value**
   - In both `src/pages/SalesInvoice.tsx` and `src/pages/POSSales.tsx`, Enter handlers submit `searchInput.trim()`.
   - With fast scanner input, the Enter key can fire before React state is fully updated, so the handler can read a stale/partial barcode.
   - This matches the complaint: sometimes scan works, sometimes not, sometimes needs another Enter.

2. **Camera scan path is race-prone**
   - Current flow is `setSearchInput(barcode)` → wait 100ms → dispatch synthetic Enter.
   - That depends on state finishing before the fake key event runs, so it is inherently unreliable.

3. **SalesInvoice has inconsistent barcode input logic**
   - One barcode input uses scanner-detection handlers.
   - Another input uses plain `setSearchInput(...)` + Enter forwarding.
   - Same feature, different behavior = intermittent complaints depending on which layout/input is active.

4. **No reliable auto-submit fallback for scanner-like input**
   - Some scanners send an Enter suffix, some don’t.
   - Current billing flow mostly waits for Enter, so scanner behavior varies by device/settings.

## Plan to fix

### 1. Make barcode submission read from the actual input element
In both billing screens:
- Replace Enter handlers so they submit `e.currentTarget.value.trim()` instead of React state
- Use one shared `submitBarcode(rawValue)` function per screen
- Keep clearing/focus behavior inside that function

### 2. Remove synthetic Enter dispatch for camera scans
In both screens:
- Change camera callback from:
  - set input
  - dispatch fake Enter
- To:
  - directly call the same `submitBarcode(barcode)` function
- This removes the async timing dependency entirely

### 3. Unify SalesInvoice barcode behavior
In `src/pages/SalesInvoice.tsx`:
- Make both barcode inputs use the same handlers and same submission path
- Stop having one “special” barcode input and one fallback/manual path with different logic

### 4. Add scanner auto-submit fallback
In both screens:
- If input pattern is scanner-like and reaches barcode length, auto-submit after a very short settle delay
- Keep Enter/manual submit as a fallback
- Add duplicate-guard refs so one scan cannot submit twice

### 5. Prevent search UI from interfering with barcode entry
Especially in `src/pages/SalesInvoice.tsx`:
- Suppress the browse-search effect/dropdown while barcode scanning is in progress
- Keep product-name browsing working, but separate it from “exact barcode add” flow

## Files to update

- `src/pages/SalesInvoice.tsx`
- `src/pages/POSSales.tsx`
- Possibly `src/hooks/useBarcodeScanner.tsx` if a small helper is needed for stable auto-submit timing

## Technical details

```text
Current problem flow:
scanner types chars very fast
-> setSearchInput(...) batches asynchronously
-> Enter handler reads old searchInput state
-> product lookup runs with incomplete/old barcode
-> intermittent "not found"

Safer flow:
scanner/manual/camera provides raw value
-> submitBarcode(rawValue.trim())
-> exact lookup
-> add product
-> clear input + refocus
```

## Expected result after fix

- Scanned barcode loads product on the first attempt
- Manual barcode + Enter works consistently
- Camera scan works consistently
- Behavior becomes the same across Sales Invoice and POS
- No backend/database change needed

## Validation after implementation

Test these exact cases in Ella Noor:
1. Scan `90002773`
2. Scan `90002939`
3. Type barcode manually and press Enter once
4. Paste barcode and press Enter
5. Camera-scan barcode
6. Rapid repeated scans of the same item
7. Scanner with and without Enter suffix
8. Verify both **Sales Invoice** and **POS Sales** windows
