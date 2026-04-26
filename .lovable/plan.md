# Partial Pending Credit Note Redemption in POS S/R Window

## Problem (verified in code)

In `src/components/FloatingSaleReturn.tsx`:

1. **Line 153** — Pending Credit Notes are only fetched when `customerId` is **passed in as a prop** from POS. If the POS bill has no customer and the user picks one inside the S/R dialog (line 837–865), the pending CN list **never reloads** for the picked customer.
2. **Line 972–982** — The "Apply" button hard-codes the **full** `pcn.creditAmount`. There is no input for the user to redeem only a partial amount (e.g., ₹3000 out of ₹5000).
3. **Line 524–565** — The "apply only" path (no return items + appliedCreditNoteId) marks the whole sale_return as `adjusted` and writes a voucher for the full `cn.creditAmount`. Partial usage isn't supported in this branch.
4. **POS handler** (`POSSales.tsx` line 3564 / 3692) sets `saleReturnAdjust = amount` correctly when a CN is applied — so the plumbing into the bill's S/R Adjust field is already in place. We just need the dialog to send the **partial** amount.

The underlying `credit_notes` table already has `credit_amount` + `used_amount` columns and the `apply_credit_note_to_sale` RPC supports partial FIFO redemption (see `useCreditNotes.tsx` line 147), so the data model already supports partial — only the S/R UI is missing it.

## Fix Plan

### 1. `src/components/FloatingSaleReturn.tsx` — load CN for inline-picked customer

Convert the pending CN fetch (currently inside the open-dialog `useEffect` at line 149–191) into its own `useEffect` keyed on `effectiveCustomerId`:

- Trigger: `[open, organizationId, effectiveCustomerId]`
- When `effectiveCustomerId` changes (because user picks a customer inside the dialog), refetch `sale_returns` where `credit_status='pending'` for that customer.
- Clear `appliedCreditNoteId` / `appliedCreditAmount` when the customer changes.

### 2. `src/components/FloatingSaleReturn.tsx` — editable redemption amount per pending CN

Replace the single "Apply ₹X" button (line 972–982) with:

- An inline number input pre-filled with the **full** `pcn.creditAmount` (so single-click default behaviour is preserved).
- Min `1`, max `pcn.creditAmount`.
- An "Apply" button next to it that sets:
  - `appliedCreditNoteId = pcn.id`
  - `appliedCreditAmount = userEnteredAmount` (clamped to `[1, pcn.creditAmount]`)
- Inline validation toast if user enters > available CN amount.
- The existing "Remove" button stays and clears both fields.

Add a small helper text under the input: `"Available: ₹{full}. Enter amount to redeem now."`

### 3. `src/components/FloatingSaleReturn.tsx` — partial-aware save flow

Update `handleSaveReturnInner` apply-only branch (line 524–565):

- Compute `redeemAmount = Math.min(appliedCreditAmount, cn.creditAmount)`.
- If `redeemAmount < cn.creditAmount` (**partial**):
  - Do **NOT** mark the sale_return as `adjusted`. Keep `credit_status = 'pending'` so the remainder stays redeemable.
  - Reduce the SR's `net_amount` by `redeemAmount` (so the remaining balance reflects what's still owed to the customer).
  - Insert the receipt voucher for `redeemAmount` only (with description `"Credit note {returnNumber} partially applied (₹{redeemed} of ₹{full}) via POS"`).
- If `redeemAmount === cn.creditAmount` (**full**): keep current behaviour — mark `adjusted`, voucher for full amount.
- Pass `redeemAmount` to `onReturnSaved(...)` so POS sets `saleReturnAdjust = redeemAmount`.

Apply the same partial logic to the secondary apply branch at line 705–742 (CN applied alongside a fresh return).

### 4. POS already handles the rest

`POSSales.tsx` lines 3564 and 3692 already do:
```ts
if (refundType === "credit_note") {
  setSaleReturnAdjust(amount);
}
```
The bill footer (line 4972–5005) already shows S/R Adjust and recalculates `finalAmount` (line 1957–1958). When the user scans new items, the bill total will automatically show the difference (new items total − S/R Adjust = amount due). No POS code change needed.

### 5. Visual feedback in the S/R dialog header / footer

When `appliedCreditNoteId` is set with a partial amount, show in the dialog footer:
```
Apply Credit Note: ₹3,000 (of ₹5,000 available — ₹2,000 remains)
```
instead of the current single-amount line (line 1179–1185).

## Acceptance tests

1. **Inline pick loads CN list**: Open POS without selecting a customer → click S/R → pick "FAISAL CAP" inside dialog → pending CN list appears for that customer.
2. **Default full apply still works**: Customer has one ₹5000 CN → click Apply → S/R Adjust on bill = ₹5000, sale_return marked `adjusted`, voucher = ₹5000.
3. **Partial apply**: Same ₹5000 CN → change input to `3000` → Apply → S/R Adjust on bill = ₹3000, sale_return remains `pending` with `net_amount = 2000`, voucher = ₹3000 with description noting "partially applied".
4. **Scan new items after partial apply**: With S/R Adjust = ₹3000, scan a ₹4500 item → bill footer shows Net Amount = ₹1500 (₹4500 − ₹3000).
5. **Re-redeem remaining**: Reopen S/R for same customer → pending list shows the same SR with `creditAmount = 2000` → user can redeem the rest.
6. **No regression for cash refund / exchange / new return flows** — only the apply-only and combined-apply branches are changed.

## Out of scope

- No DB migration. We're using existing columns (`sale_returns.net_amount`, `sale_returns.credit_status`, `voucher_entries`).
- No change to the POS footer's separate `Cr ₹X` panel (which uses the `credit_notes` table). That stays as-is.
- No change to refund/cash-refund logic (was fixed in previous turn).
