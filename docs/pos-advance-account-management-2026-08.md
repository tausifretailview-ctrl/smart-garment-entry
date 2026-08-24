# Phase 0 — POS advance / opening-balance handling gap

**Date:** 2026-08-24  
**Status:** Phase 0 complete (read-only). **Phase 1 (choice A) implemented:** POS applies existing `customer_advances` via `consumeAdvanceFIFO` after save. Mix over-tender still blocked; POS never creates a booking from tender. POS Dashboard Record Payment → Advance uses the same FIFO helper (no `payment_method: 'advance'` receipt).

Related: `docs/customer-accounts-consistency-v1.md` (advance apply = `consumeAdvanceFIFO` only), `docs/customer-balance-hardening-plan.md`, Payments OB-first FIFO in `CustomerPaymentTab.tsx`.

---

## Verdict

POS **shows** unused advance (orange **Adv** chip in the customer picker) and can **book** a new advance (footer **Advance** → `AddAdvanceBookingDialog`). It **cannot apply** that booking to the bill being rung. The footer **Cr ₹** / **Apply ₹X** path is credit notes only (`credit_notes` via `getAvailableCreditBalance` / `applyCredit` → `applyCreditNoteFifoToSale`).

This is primarily a **UX/friction gap** at the counter: the correct apply path already exists **after** the POS sale exists, on Accounts → Payments / Sales Invoice Dashboard / Settle Customer Account, because POS bills live in `sales` (`sale_number` `POS/YY-YY/N`) and `consumeAdvanceFIFO({ saleId })` is sale-id based.

It is **not** a formula bug in `computeCustomerOutstanding`. Unused advance is a separate pool and must not reduce outstanding until applied.

There is a **correctness trap** in a nearby almost-workaround: POS Dashboard → Record Payment → mode **Advance** writes a normal receipt with `payment_method: 'advance'` and **does not** call `consumeAdvanceFIFO`, so `customer_advances.used_amount` is not consumed. That path must not be treated as the supported workaround (see Q3).

---

## Confirmed code facts (re-verified 2026-08-24)

| Claim | Result |
|--------|--------|
| `getCustomerAdvance` on POS | One call site: `POSSales.tsx` customer picker (`getCustomerAdvance(customer.id)` → orange `₹… Adv` chip). Source is snapshot `advanceAvailable` (`useCustomerBalances` / `get_customer_financial_snapshot`). Display-only. |
| Footer Apply / `creditApplied` | Wired only to CN. `useEffect` on `customerId` calls `getAvailableCreditBalance` → `credit_notes` (`credit_amount - used_amount`). Banner + footer **Cr ₹** render iff `availableCreditBalance > 0 \|\| creditApplied > 0`. |
| `applyCredit` | `useCreditNotes.tsx` → `applyCreditNoteFifoToSale` (RPC `adjust_invoice_balance`). Notes: `"POS credit apply (FIFO)"`. |
| `customer_advances` insert in POS / `useSaveSale` | **Zero** matches. Booking goes through `AddAdvanceBookingDialog` → `useCustomerAdvances.createAdvance` → `createCustomerAdvance`. |
| `consumeAdvanceFIFO` from POS | **Never called** from `POSSales.tsx` or `useSaveSale.tsx`. Callers: `CustomerPaymentTab`, `SalesInvoiceDashboard`, `BulkAdvanceAdjustDialog`, `SettleCustomerAccountDialog`. |
| Live status values | FIFO reads `status IN ('active','partially_used')` and writes `fully_used`. There is **no** `'used'` status. Prompt’s `status IN ('used','partially_used')` is not the live enum. |

`useSaveSale` maps `saleData.creditApplied` into `derivePaidAndStatus({ advanceApplied: creditApplied, cnApplied: 0 })` on insert, then `applyRecomputedSalePaymentState` runs, then POS calls `applyCredit` (CN) after save. That slot is a **CN amount mislabeled as advance**. Phase 1 must not reuse `creditApplied` for real advances.

---

## Q1 — What the cashier sees (POS UI, advance-only customer)

Authenticated POS against production could not be opened from this environment (no org login; anon RLS). UI is reconstructed from the live render conditions, which are unambiguous.

**Customer search dropdown** (only while the picker is open; balances fetch is gated on `openCustomerSearch`):

- Orange chip: `₹{n} Adv` when `snapshot.advanceAvailable > 0`.
- Purple chip: `₹{n} CN` when `cnAvailableTotal > 0`.
- Red `Due` / green `Cr` for signed outstanding.

**After selecting a customer with unused advance and zero CN:**

- Orange **Adv** chip was visible **in the list**, then the popover closes. There is **no persistent Adv amount on the selected-customer field**.
- Footer **Customer Balance** still appears (`useCustomerBalance` → `netPosition`). Unused advance is `unusedAdvanceTotal` and **does not** reduce that box (`customerBalanceCore`: unused advance must not reduce `balance`).
- Footer **Cr ₹** input and the purple **“₹X credit note available … Apply ₹X Now”** banner **do not render** (`availableCreditBalance === 0`).
- There is no Apply Advance control. Footer **Advance** opens **Add Advance Booking** (cash in), not apply.

So: the cashier can *see* that the customer has an advance (briefly, in search), then rings the bill as if the pool did not exist. They cannot type an apply amount; the control is absent, not a ₹0 field.

**Live 2–3 org screenshot** is blocked here. Appendix SQL lists candidate `(org, customer)` rows for Tausif to open on POS (advance > 0, CN = 0).

---

## Q2 — How many customers this affects (measurement)

### What we could run

Anon `GET /rest/v1/customer_advances?select=id&limit=1` → **HTTP 200, `[]`**. RLS hides tenant rows. No service-role / staging key in this checkout. Same constraint as `docs/phase0-anusha-advance-refund.md`.

**Do not treat empty as “zero affected customers.”**

### Exact query (service-role / SQL editor) — unused advance then POS sale

Remaining = `amount - used_amount - refunds`, status `active` or `partially_used`. POS sale = `sales.sale_number LIKE 'POS/%'` with `deleted_at IS NULL` **after the earliest currently unused booking** (`MIN(created_at)` of rows that still have remaining). Using `MAX` would drop customers who booked again after a POS sale even though unused advance already existed at the counter.

See `scripts/pos-advance-gap-measure-2026-08.sql` (SELECT-only). Capture:

1. Customers with unused advance who later have a POS sale (population for this gap).
2. Distinct orgs in (1).
3. Orgs that ever booked an advance (`customer_advances` any row) vs orgs that ever saved a POS sale.
4. Three sample customers with unused advance, **zero** open CN, for Q1 screenshots.

### “Advance Booking enabled” gate

There is **no** settings flag that turns Advance Booking on/off.

- Menu right `advance_booking_dashboard` (User Rights; default `true` in `UserRights.tsx`).
- POS footer **Advance** always opens `AddAdvanceBookingDialog` (no extra setting).

Practical org filter: **has at least one `customer_advances` row**. Orgs that never book advances are unaffected even if POS is used.

Known from earlier ELLA NOOR work: that org *does* book advances (ledger/booking screens). Whether they also ring POS/`POS/%` after a booking is a SQL answer, not assumed here.

---

## Q3 — What the shop does today instead

### Supported workaround (correctness OK)

1. Cashier saves the POS bill (often pay-later / Mix credit remainder, or full cash while leaving the advance unused).
2. Later, Accounts → **Payments**, **Sales Invoice Dashboard → Record payment → Advance**, **Bulk Advance Adjust**, or **Settle Customer Account**.

Those paths load `sales` for the customer **without excluding `POS/`**. `isSaleExcludedFromCustomerPaymentPicker` only drops hold/cancelled/`Hold/`. `consumeAdvanceFIFO({ saleId: posSale.id })` writes:

- `voucher_entries`: `voucher_type=receipt`, `payment_method=advance_adjustment`, `reference_type=sale`, `reference_id=<sale uuid>`
- description: `Adjusted from advance balance for invoice (advance {advance_number})`
- `customer_advances.used_amount` / `partially_used` | `fully_used`
- then `syncSalePaymentsFromVouchersBatch` / `applyRecomputedSalePaymentState`

So: **applying advance to a POS-created sale from Payments is a functioning accounting path.** Friction is leaving the counter, not “POS sales are invisible to FIFO.”

`SettleCustomerAccountDialog` also takes `saleId` FIFO by `sale_date` and **does not** run `targetOpeningBalance` first (Payments and Bulk Adjust **do**). Phase 1 should follow Payments, not Settle, for OB order.

### Unsupported almost-workaround (correctness fail)

**POS Dashboard → Record Payment** shows `Advance (₹X)` when unused booking exists, then inserts a receipt with `payment_method: paymentMode` (`'advance'`), description `Payment received for POS sale {sale_number}…`, and **never** calls `consumeAdvanceFIFO`.

Canonical application detector (`isAdvanceApplicationVoucher`) requires `payment_method = 'advance_adjustment'` **or** description starting `adjusted from advance balance`. This voucher is treated as **ordinary cash-like receipt**: invoice looks paid, **booking unused amount stays**. Do not send cashiers here to “apply advance.”

### Booking vs apply on POS itself

Footer **Advance** = new booking (`createCustomerAdvance`, GL 2150 via `recordCustomerAdvanceReceiptJournalEntry`). Opposite of consume.

---

## Q4 — Interaction with OB-first FIFO

**Answer: POS one-bill context does not make OB-first irrelevant.**

Approved Payments rule: unused advance settles **remaining opening balance** (`consumeAdvanceFIFO({ targetOpeningBalance: true })`) **before** any invoice. OB predates every `sales` row. Applying the pool to “this POS bill only” while OB remaining > 0 would consume booking that should have closed OB and leave OB still due.

That is customer-account order, not a Payments-screen quirk.

**POS Phase 1 recommendation:**

- Before apply, `fetchCustomerOpeningBalanceRemaining(org, customer)`.
- If remaining OB > ₹0.01: **do not** apply to the current bill. Toast: settle opening balance on Payments first (or run the same two-step FIFO as Payments: OB voucher then sale voucher — surprising at a counter because it mutates a non-bill target).
- If remaining OB is 0: `consumeAdvanceFIFO({ saleId: savedPosSale.id, requestedAmount })` only.

Do not invent a third FIFO.

---

## Q5 — Interaction with POS exchange / refund

Same-bill exchange: `saleReturnAdjust` can exceed bill; `exchangeRefundDue` forces Mix **Refund Mode** (cash/UPI/bank vs issue CN). `useSaveSale` writes a **payment** voucher for cash refund (negative tender / `writeExchangePaymentVouchers`). Issue-CN uses `createCreditNote` against the new sale.

**Existing CN apply (`creditApplied`) vs refund:**

- Totals: `creditApplied` reduces `finalAmount`; `amountBeforeCredit = finalAmount + creditApplied`.
- `handleApplyCredit` caps at `min(amount, availableCreditBalance, amountBeforeCredit)`. If the bill is already refund-due (`finalAmount` ≤ 0), cap is ≤ 0 → cannot apply CN.
- Mix save: `applyCredit` is skipped when `isCreditNote` (refund issued as CN). Cash refund still runs `applyCredit` if `creditApplied > 0`.

**New POS advance-apply:**

- **Real interaction if** advance can be applied on a refund-mode bill (would shrink payable further while still paying `exchangeRefundDue` cash/CN) **or** if it shares `creditApplied` with CN (double-count vs `derivePaidAndStatus` / post-save FIFO).
- **Non-issue if** Phase 1: (1) separate `advanceApplied` state, never `creditApplied`; (2) disable advance apply when `exchangeRefundDue > 0` or Mix is refund mode; (3) consume **after** `sale.id` exists via `consumeAdvanceFIFO`, then `applyRecomputedSalePaymentState`; (4) do not pass advance into insert-time `derivePaidAndStatus.advanceApplied` (that field is already abused by CN).

Exchange refund writes `voucher_type=payment`; advance apply writes `receipt`/`advance_adjustment`. Different voucher types — no shared writer — **if** those guards hold.

---

## Q6 — Design proposal (do not build)

### (a) Apply Advance on POS — parallel to CN, shared FIFO

**Do not** implement a POS-local `used_amount` loop (`useCustomerAdvances.applyAdvance` is unused and does not write `advance_adjustment` vouchers).

**State:** `advanceApplied` + `availableAdvanceBalance` (from `getAvailableAdvanceBalance` / snapshot `advanceAvailable`, refreshed on `customerId`). Footer chip **Adv ₹** + input, analogue of **Cr ₹**, only when `availableAdvanceBalance > 0`. Do not hide it behind the CN condition.

**Cap:** `min(requested, availableAdvanceBalance, amountBeforeCredit - creditApplied, remaining OB-safe room)`. Refuse when remaining OB > ₹0.01 (Q4).

**Save order (after `saveSale`/`updateSale` returns `id`):**

```ts
const { consumed, vouchers } = await consumeAdvanceFIFO(supabase, {
  customerId,
  organizationId: currentOrganization.id,
  saleId: result.id,           // never targetOpeningBalance from POS
  requestedAmount: advanceApplied,
  voucherDate: /* POS sale date yyyy-MM-dd */,
  shopName: /* current shop if used elsewhere */,
  createdBy: user.id,
});
await applyRecomputedSalePaymentState(result.id, currentOrganization.id);
// If accounting_engine_enabled: recordCustomerAdvanceApplicationJournalEntry
//   (last voucher id, org, consumed, date, description, supabase)
```

Same helper as Payments. Description stays the FIFO default (`Adjusted from advance balance for invoice (advance …)` — **must not** embed the POS sale number in an OB voucher; sale-targeted FIFO already omits the number in the default string). Optional journal description may include `result.sale_number` the way `SalesInvoiceDashboard` does.

If `consumed < requested`, toast the shortfall; do not invent a second writer.

**Not in this apply path:** `createReceiptVoucher` with `payment_method: 'advance'` (POS Dashboard bug).

### (b) Excess POS tender → new `customer_advances` row

**Today:** Mix Pay **blocks** `totalPaid > payableBill` (`exceedsBill` disables Save). Remainder of Mix is `creditAmount` = unpaid bill (pay-later on **this sale**), not a booking. Payments **blocks** overpayment (`assertCustomerPaymentWithinOutstandingCap`). New bookings are explicit: Advance Booking dialog / `createCustomerAdvance` with `status: 'active'`, `used_amount: 0`, GL `recordCustomerAdvanceReceiptJournalEntry` (DR cash/bank, CR 2150), description user text or `Advance {advance_number}`.

POS therefore **cannot silently overpay into an advance** without a new product path.

### Product decision for Tausif (required before Phase 1 overpay work)

| Option | Behaviour | Matches today? |
|--------|-----------|----------------|
| **A (recommended default)** | POS never creates `customer_advances` from tender. Over-tender stays blocked. Apply existing bookings only (Q6a). New money in = footer **Advance** dialog. | Yes |
| **B** | Explicit toggle on Mix: “Keep excess as advance.” Then `createCustomerAdvance({ amount: excess, paymentMethod, description: \`POS overpayment ${sale_number}\`, status: 'active' })` + cash receipt GL. | New |
| **C** | Silent: any cash over bill becomes an advance. | New, easy to mis-key |

**Ask Tausif:** A, B, or C? Engineering must not assume C.

If B/C ever ships: same `createCustomerAdvance` helper as booking; never a second insert path; never treat Mix `creditAmount` (unpaid) as an advance.

---

## Explicitly out of scope (this phase)

- POS UI, `consumeAdvanceFIFO` callers, `customer_advances` writes, `derivePaidAndStatus` formula.
- Fixing POS Dashboard `payment_method: 'advance'` (separate, worth a Phase 1 ticket so the fake workaround cannot keep drifting).
- Teaching Settle dialog OB-first (Payments already has it).

---

## Phase 1 build prompt (draft, after sign-off)

1. Run appendix SQL; paste counts + 3 screenshot customers into this doc.  
2. POS footer **Apply Advance** using `consumeAdvanceFIFO` as in Q6a; OB remaining guard.  
3. Do not reuse `creditApplied`. Disable on exchange refund mode.  
4. Overpay→advance only if Tausif picks B or C.  
5. Optional follow-up: POS Dashboard Record Payment Advance must call `consumeAdvanceFIFO` or the menu item removed.

---

## Appendix — live query blocker

```
GET {SUPABASE}/rest/v1/customer_advances?select=id&limit=1
Authorization: anon publishable key
→ 200 []
```

Measurement: `scripts/pos-advance-gap-measure-2026-08.sql` (SELECT only).
