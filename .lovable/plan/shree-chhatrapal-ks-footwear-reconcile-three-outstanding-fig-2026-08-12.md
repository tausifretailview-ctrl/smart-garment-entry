# SHREE CHHATRAPAL (KS Footwear) — reconcile three outstanding figures

Customer: SHREE CHHATRAPAL FW-KANDIVALI W. Three screens show three numbers:

| Screen | Figure | How it is computed |
|---|---|---|
| Invoice dashboard / bill-wise | ₹73,165 | Σ (net − `paid_amount` − return adjust) |
| Customer ledger | ₹71,899 | Σ net − Σ receipt vouchers − Σ settlement discount |
| WhatsApp reminder | ₹70,720 | dashboard figure with the ₹2,445 over-receipt absorbed |

Totals: net ₹1,42,545 · `paid_amount` ₹69,380 · receipts ₹70,253 · settlement discount ₹393.

Two real data defects explain the whole spread — nothing here is a rounding or display artefact.

**Defect A — ₹1,179 of receipts missing (invoices marked paid with no money behind them)**

- INV/25-26/280 — net ₹3,165, `paid_amount` ₹3,165, receipts ₹2,785 + ₹95 discount → short ₹285
- INV/25-26/499 — net ₹9,936, `paid_amount` ₹9,936, receipts ₹8,744 + ₹298 discount → short ₹894

Both are flagged `completed`. The ledger still counts the ₹1,179 as owed; the dashboard and WhatsApp trust `paid_amount` and drop it.

**Defect B — ₹2,445 over-receipt on INV/25-26/694**

Net ₹32,555 against ₹35,000 of receipts across six vouchers (May–Aug). The excess was never moved to an open bill, so it silently reduces only the WhatsApp figure.

## Step 1 — Decide the ₹1,179 (needs your answer, no code yet)

For invoices 280 and 499 the software says paid but no receipt exists. One of two things happened:

1. **Cash was collected and never entered** → we post two back-dated receipt vouchers (₹285, ₹894, cash) so the ledger agrees with `paid_amount`. True outstanding becomes **₹70,720**.
2. **The bills were closed by mistake / a discount was given verbally** → we post them as settlement discount instead of cash, or reopen the balance for collection. True outstanding becomes **₹71,899** if left owed.

I'll write no repair until you confirm which. Deliverable of this step: a one-page statement listing both invoices, their vouchers, the shortfall, and the recommendation (option 1 is the likely reality given both bills are old and marked completed).

## Step 2 — Repair and prevent

Once step 1 is answered:

1. **Reallocate the ₹2,445 excess from INV/25-26/694** to the oldest open invoices, FIFO, by writing proper receipt vouchers against those bills (audit trail preserved; the original vouchers are not edited). INV/694 is then settled exactly at ₹32,555.
2. **Close the ₹1,179 gap** using the option chosen in step 1 — receipt vouchers or settlement-discount vouchers, back-dated to the invoice's closure date.
3. **Recompute payment state** on every touched invoice through `compute_sale_settlement` so status, `paid_amount`, and vouchers converge.
4. **Unify the reminder formula.** The WhatsApp reminder builds its own total instead of reading the shared customer snapshot. Point it at the same snapshot the ledger uses, so the reminder can never quote a different number again.
5. **Add an invariant** to the nightly accounting digest: invoice marked `completed` where receipts + discount + return adjust falls short of `paid_amount` by more than ₹1, and receipts exceeding net by more than ₹1. Both defects here would have been caught the next morning.

## Verification

After the repair, all three surfaces must read the same figure (₹70,720 under option 1). I'll re-run the per-invoice comparison, open the customer ledger, and generate a WhatsApp reminder preview to confirm the three agree before reporting done.

## Technical notes

- Repairs go in as a scoped migration for org `KS FOOTWEAR` and this customer only, with a preflight snapshot for rollback.
- No `paid_amount` is hand-edited; every change is a voucher plus a settlement recompute.
- Reminder change touches the reminder builder only — the ledger and dashboard math stays as-is.
