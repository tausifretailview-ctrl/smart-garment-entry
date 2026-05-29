# Fix engine-off orgs and the 1 stuck AdTechAgency voucher

## Findings from live DB

**Engine OFF (2 orgs):**
- BAWLEE (`153c07a0-7c5c-434f-90ee-9b48f95a3f0f`)
- HIVAA COLLECTION (`056b0f96-c62c-4439-ac26-6bba54575012`)

**AdTechAgency stuck voucher (1 pending):**
- `RCP/25-26/1` — ₹1,770 cash receipt from SAKIB A PATEL for INV/25-26/2
- Voucher id: `a3e0b2a4-4fbe-46d3-b137-1c8ca563f859`
- **Root cause:** `reference_type = 'customer_payment'` (legacy lowercase snake_case). The backfill scanner in `historicalMigration.ts` only recognises `CustomerReceipt`, `SupplierPayment`, `ExpenseVoucher`, `SalaryVoucher`, `StudentFeeReceipt`, `CustomerCreditNoteApplication`, `CustomerAdvanceApplication`, `Payment`. So `customer_payment` falls through every dispatch in `repostJournalForRestoredVoucher` and never gets a journal entry created.

## Plan

### Step 1 — Audit for other legacy reference_type values (read-only)
Scan `voucher_entries` across all orgs for any `reference_type` not in the canonical PascalCase set so we know if this is a one-off or a pattern.

### Step 2 — Data fix for AdTechAgency's stuck voucher
Update that single row's `reference_type` from `customer_payment` → `CustomerReceipt` (via the insert/update tool). It already has `payment_method='cash'`, a valid customer reference, and a matching sale (`INV/25-26/2`), so the standard `CustomerReceipt` poster will handle it correctly.
If Step 1 finds more legacy values, extend the same normalisation to those rows in the same update.

### Step 3 — Turn engine ON for BAWLEE & HIVAA (data update)
Update `settings.accounting_engine_enabled = true` for both orgs.

### Step 4 — Backfill the 3 orgs from the UI
Ask the user to open each org and click **Run Historical Ledger Backfill** (BAWLEE, HIVAA COLLECTION, AdTechAgency). After Step 2+3 there should be 0 pending / 0 failed.

### Step 5 — Hardening (code change, optional)
Add a tolerant normaliser in `historicalMigration.ts` + `journalService.repostJournalForRestoredVoucher` so legacy lowercase variants (`customer_payment`, `supplier_payment`, `expense`, `salary`, `student_fee_receipt`, etc.) map to their canonical PascalCase posters. Prevents this drift from recurring if old data is restored or imported.

## Open question for you
Do you want me to do **only Steps 2 + 3** now (quick data fix), or also **Step 5** (code-level normaliser) so the backfill never misses legacy types again?
