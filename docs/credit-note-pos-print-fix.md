# Credit Note POS print fix

## Changes

- **POSSales.tsx:** Credit Note print uses `react-to-print` + `creditNotePrintRef` (same pattern as main POS invoice). Removes silent `window.open` popup-blocker failure.
- **CreditNotePrint.tsx:** Null-safe `credit_amount` via `formatCreditNoteAmount()`.

## GST — product question for Tausif (do not implement speculatively)

Confirm with Tausif whether this Credit Note is ever used to formally adjust a GST-registered sale's taxable value for reporting purposes. If yes, it needs a GST breakdown matching the original invoice; if it's purely a store-credit instrument, no change needed.

The current Terms & Conditions ("Not redeemable for cash," "used for future purchases") suggest store-credit voucher semantics — no CGST/SGST split today.
