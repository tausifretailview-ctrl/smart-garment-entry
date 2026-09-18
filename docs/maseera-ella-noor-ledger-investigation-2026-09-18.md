# MASEERA (ELLA NOOR) — ledger missing SR/159 + dated CN Adjust + Credit vs Unclaimed

**Date:** 18 Sep 2026  
**Org:** ELLA NOOR (`3fdca631-1e0c-4417-9704-421f5129ff67`)  
**Customer:** MASEERA, phone 9632982953  
**Evidence:** `MASEERA_Ledger_18-09-2026_5801.pdf` generated 18 Sep 2026 15:25; Customer Balances / Sale Returns / Sales Invoice / Adjust Credit Note screenshots same day.  
**This pass:** facts and root cause only. **No repair.**

Production tenant tables are RLS-blocked from this environment (anon key only). Reconstruction uses the PDF + screenshots plus the functions that emit each printed figure. Same discipline as `docs/almas-motiwala-ledger-investigation-2026-09-16.md`.

---

## 0. Hand-verified transactions (not report totals)

| When | Voucher | What | Money |
| --- | --- | --- | --- |
| 09/09 15:05 | POS/26-27/51 | POS + UPI at sale | ₹15,250 in/out, settled |
| 09/09 15:07 | POS/26-27/52 | POS + UPI at sale | ₹16,800 in/out, settled |
| 09/09 15:00 (invoice) | INV/26-27/3122 | Invoice ₹8,400 | Dashboard Paid / Balance ₹0; `+S/R ₹8,400` |
| **18/09** | **RCP/26-27/4837** | CN adjust vs 3122 | **₹8,400** (appendix) |
| 18/09 | SR/26-27/159 | Sale return, CN/26-27/119 | Gross **₹9,400**. Dashboard: **S/R Adjusted in Invoice**, Adj. Amt **₹10,700**, no remaining line |
| 18/09 15:04 | SR/26-27/160 | Sale return, CN/26-27/120 | Gross **₹13,850**. Dashboard: **CN Partially Applied**, Adj. Amt ₹10,700 + **₹3,150 remaining** |
| 18/09 15:06 | INV/26-27/3123 | Invoice ₹10,700 | Dashboard Paid; `S/R ₹10,700 adj 18/09/2026` |
| 18/09 | RCP/26-27/4838 + 4839 | CN adjust vs 3123 | ₹1,000 + ₹9,700 = ₹10,700 |

Sale Returns dashboard lists **both** SR/159 and SR/160, both 18/09/2026, neither deleted/cancelled.

Adjust Credit Note opened on **SR/160**: **₹4,150.00 available to allocate** — that figure is `resolveSaleReturnCnAvailable` for **this return’s CN header**, not a customer-wide sum (`AdjustCustomerCreditNoteDialog.tsx`). So CN/120 live remaining is **₹4,150**.

Customer Balances search MASEERA: Outstanding 0, Advance 0, **CN ₹4,150 Cr**.

PDF disagrees with that:

| Surface | Printed | Correct? |
| --- | --- | --- |
| Banner **Credit balance (Cr)** | ₹3,150 | **Wrong** (short ₹1,000 vs live CN) |
| Arithmetic line **Unclaimed returns** | ₹4,150 | **Correct** (matches Customer Balances + Adjust dialog) |
| Main table Sale Return | **SR/160 only** | SR/159 omitted |
| CN Adjust on INV/3122 | **09/09 15:00** | Actual voucher **18/09 RCP/4837** |
| Recon `(−) Sale Returns` | ₹3,150 | Same undercount as banner |
| Page 2 CN available (notes) | ₹3,150 | Same undercount |
| Column totals running Balance | ₹13,850 Cr | Gross SR/160 only |

True unclaimed CN pool = **₹4,150**. Banner/recon/notes all show **₹3,150**.

### 0.1 Composition of the ₹4,150 — dashboard remaining vs CN live

The UI invites a 1,000 + 3,150 split (CN/119 leftover after ₹8,400 on 3122, CN/120 leftover after ₹10,700 on 3123). That split is **what Sale Returns `remaining_cn_amt` displays**, not what the CN headers hold.

Dashboard `remaining_cn_amt` is **not** CN live remaining:

```549:550:src/pages/SaleReturnDashboard.tsx
        const remaining_cn_amt =
          r.linked_sale_id && linked ? Math.max(0, net - sra) : 0;
```

`actual_adjusted_amt` is the **linked invoice’s** `sale_return_adjust`, not this SR’s applied slice.

| Row | Status label | Adj. Amt | Remaining line | What that implies |
| --- | --- | --- | --- | --- |
| SR/160 | CN Partially Applied (`partially_adjusted`) | ₹10,700 | ₹3,150 | `linked_sale_id` = INV/3123 (SRA ₹10,700); `13850 − 10700 = 3150` |
| SR/159 | **S/R Adjusted in Invoice** (`adjusted` + linked + remaining_cn_amt === 0) | **₹10,700** (no remaining line) | — | **Also linked to INV/3123**, because `9400 − 10700 = 0` and Adj shows 3123’s SRA, not 3122’s ₹8,400 |

`applyCreditNoteFifoToSale` overwrites `linked_sale_id` to the **last** invoice it applied this SR to (`saleSettlement.ts`). FIFO by `return_date` then explains the appendix:

1. RCP/4837 ₹8,400 vs 3122 ← CN/119 (oldest). CN/119 leftover ₹1,000, status would have been `partially_adjusted`, linked=3122.
2. RCP/4838 ₹1,000 vs 3123 ← CN/119 leftover. CN/119 now fully used → `credit_status='adjusted'`, **linked overwritten to 3123**.
3. RCP/4839 ₹9,700 vs 3123 ← CN/120. CN/120 leftover **₹4,150**, `partially_adjusted`, linked=3123.

That matches:

- Adjust dialog on SR/160 = **₹4,150** (CN/120 live).
- Customer Balances CN = **₹4,150** (if SR/159 CAB is 0, adding SR/160 CAB 4,150).
- It does **not** match “CN/119 still holds ₹1,000”. The ₹1,000 is inside INV/3123’s SRA (RCP/4838), and CN/120’s live leftover is ₹4,150, not ₹3,150.

₹3,150 is the Almas-class `net − linked_invoice.SRA` remainder on SR/160. ₹4,150 is CN/120 `credit_amount − used_amount`. Same parallel-maths pattern as Almas Motiwala.

---

## 1. Missing SR/159 — not a date filter

Function: `fetchCustomerLedgerTransactionsWithClient` in `src/utils/customerLedgerTransactions.ts`.

Sale returns are loaded with **all statuses**, `deleted_at IS NULL`, optional ledger date range only:

```236:242:src/utils/customerLedgerTransactions.ts
  let saleReturnsQuery = supabase
    .from("sale_returns")
    .select("id, return_number, return_date, net_amount, credit_status, linked_sale_id, refund_type, credit_note_id, created_at")
    .eq("customer_id", customerId)
    .eq("organization_id", organizationId)
    .is("deleted_at", null);
```

PDF is Full period — both returns are fetched. SR/159 is dropped **while building rows**:

```880:884:src/utils/customerLedgerTransactions.ts
      // Skip SRs fully absorbed on a linked invoice via sales.sale_return_adjust
      // (pending CN applied on Sales Dashboard — same as buildAuditRows / balance RPC).
      if (String(sr.credit_status || '').toLowerCase() === 'adjusted' && linkedSaleId) {
        return;
      }
```

That predicate is **identical** to `isSaleReturnConsumedAtBilling` (`src/utils/saleReturnCnBalance.ts`): `credit_status === 'adjusted' && linked_sale_id` set.

Sale Return Dashboard maps that shape to **"S/R Adjusted in Invoice"** when `remaining_cn_amt` is 0 (`formatCreditStatusLabel`). Screenshot of SR/159 is that label. SR/160 is `partially_adjusted` → **"CN Partially Applied to Invoice(s)"** → **not skipped**.

It is **not**:

- a window relative to today
- `deleted_at`
- missing from `sale_returns`

It **is** an intentional skip meant for billing-absorbed returns (ELLA / SHAHIN double-credit). `applyCreditNoteFifoToSale` / Adjust CN also writes `credit_status = 'adjusted'` + `linked_sale_id` after the CN header is fully used. A later FIFO apply (RCP/4838 on 18/09 against 3123) looks like billing absorption to the ledger, so the whole SR row is dropped — including the tracing memo that would otherwise fire when `remainingCredit <= 0`.

The skip runs **before** the memo path (`remainingCredit <= 0 && consumedAmount > 0`). SR/159 never becomes a `type: 'return'` row, memo or otherwise.

If the skip were removed **without** changing remaining math: SR/159’s `absorbedOnInvoice = min(9400, 10700) = 9400` (linked invoice is 3123), `remainingCredit = 0` → informational memo only (`credit: 0`). Recon `saleReturns` would **still** ignore it (`informational` rows are skipped). The missing **event** would be fixed; the banner figure would not.

---

## 2. CN Adjust info-row date — invoice clock, not voucher clock

When `sales.sale_return_adjust > 0`, the ledger **synthesises** a muted `cn_adjusted` row **on the invoice event**, not from `voucher_entries`:

```658:672:src/utils/customerLedgerTransactions.ts
      if (!isCancelled && saleReturnAdjust > 0) {
        allTransactions.push({
          id: `${sale.id}-cn-applied`,
          date: sale.sale_date,
          timestamp: item.timestamp || null,
          type: 'cn_adjusted',
          reference: sale.sale_number,
          description: `↳ CN / S/R adjusted on ${sale.sale_number} (pending CN applied to bill)`,
          ...
          informational: true,
        });
      }
```

Invoice combined items use `date: sale.sale_date`, `timestamp: sale.created_at`. So INV/3122’s CN Adjust prints **09/09 15:00**.

The appendix is a **different query**: `payment_method = 'credit_note_adjustment'` mapped with `voucher_date` (`CustomerLedger.tsx` `cnAllocRows`). That correctly shows **18/09 RCP/26-27/4837**.

Credit-note-adjustment **receipts are stripped** from the main table (`description` contains `credit note adjusted`) so they are not double-counted with the synthetic row — they never contribute an 18/09 timestamp to the running list.

**Not Maseera-specific.** Any customer whose CN is applied on a different calendar day than `sales.sale_date` / `created_at` gets the same mis-dated info row. INV/3123 is same-day as its CN vouchers, so the bug is invisible there.

Related (same reconstruction): invoice **Debit** is `max(0, net − current sale_return_adjust)`. Reprinting today writes INV/3122 as ₹0 Dr on **09/09**, so running Balance looks settled a week before RCP/4837. The info-row date is the visible timestamp bug; the invoice-row net-of-current-SRA is why Balance treats 3122 as paid from invoice time.

---

## 3. Two calculations — Almas-class parallel maths

### Banner “Credit balance (Cr)” ₹3,150

`CustomerLedger.tsx` PDF:

```
pdfCredit = refundableCreditBalance > 0
  ? refundableCreditBalance
  : abs(effectiveBalance) when Cr
```

Retail `effectiveBalance` = `reconciliation.invoiceOutstanding` = `computeInvoiceOutstandingFromReconciliation`.

`refundableCreditBalance` = `computeRefundableCreditBalance({ invoiceOutstanding: effectiveBalance, unusedAdvance, cnAvailable: 0 when recon.saleReturns > 0 })`.

Here unused advance = 0, recon saleReturns = ₹3,150 (> 0) so `cnAvailable` is **zeroed** (Sneha/Zohra guard). Outstanding is Cr ₹3,150 → banner = **abs(recon Outstanding) = ₹3,150**.

Recon `(−) Sale Returns` sums `saleReturnCreditForReconciliation` over **visible** `type === 'return'` rows only. Informational rows are skipped. SR/159 never appears.

Visible SR/160 remaining is **not** CN live ₹4,150. Per-row remaining is:

```
absorbedOnInvoice = min(sr.net_amount, linkedSale.sale_return_adjust)  // full invoice SRA
consumedAmount    = max(absorbedOnInvoice, appliedAmount)
remainingCredit   = net − consumedAmount
```

SR/160 linked to 3123 → `absorbedOnInvoice = min(13850, 10700) = 10700` → remaining **₹3,150**, even after Almas pass-2 of `allocateCnAdjustmentsToSaleReturns` attributes only ₹9,700 of that SRA to SR/160 (the other ₹1,000 is RCP/4838 from CN/119). `max(full SRA, allocated)` **undoes** the pass-2 leftover fix for recon remaining.

Page 2 **CN available (notes)** = `ledgerDerivedStats.cnAvailable` = sum of pending return-row `t.credit` = **₹3,150** again.

### Arithmetic line “Unclaimed returns Rs. 4,150”

Separate fetch at PDF export:

`fetchCustomerAccountStateView` → `getCustomerAccountState` → `computePendingStandaloneSaleReturns` → `saleReturnRemainingCreditForBalance`.

That **prefers `credit_available_balance` / CN live remaining** on **every** non-refunded sale return, **including** `credit_status = 'adjusted'`. Comment in `customerBalanceCore.ts`: includes pending, partially_adjusted, **and adjusted remainders**.

4,150 = CN/120 live leftover (Adjust dialog). Same number as Customer Balances CN column. Not the dashboard `remaining_cn_amt` ₹3,150.

### Does fixing the transaction list self-correct the banner?

**No — not from removing the skip alone.**

If SR/159 is emitted, remaining math still charges INV/3123’s **full** ₹10,700 SRA to whichever row is linked there:

- SR/159: remaining 0 (memo) if skip is gone.
- SR/160: remaining still ₹3,150 (`13850 − 10700`).

Banner stays ₹3,150 while Unclaimed stays ₹4,150.

The banner is **not** a third leftover formula — it is recon of **the visible row set’s `t.credit`**. It is still a **separate implementation** from Unclaimed returns (Almas pattern). A list-only fix that still uses `consumedAmount = max(full linked SRA, allocated)` leaves the ₹1,000 gap.

Self-correct would require remainingCredit on the visible return to become ₹4,150 (allocated ₹9,700, not full SRA ₹10,700) **and/or** a leftover row for the skipped SR if its CN header still had remaining (it does not, on live evidence).

---

## 4. Scope (cannot count live rows from this environment)

### 4.1 Missing Sale Return row (SR/159 class)

Predicate that hides the Sale Return row:

```sql
credit_status = 'adjusted'
AND linked_sale_id IS NOT NULL
AND deleted_at IS NULL
```

Same as dashboard “S/R Adjusted in Invoice” (when `remaining_cn_amt` is 0).

**Population:** every customer, every org, with at least one such return. CN-application consequences still show (invoice SRA, synthetic CN Adjust, appendix RCP). Includes fully consumed rows (leftover 0) — list omits the **event** even when the banner number happens to match Unclaimed.

### 4.2 Banner / recon undercount vs Unclaimed (Maseera ₹3,150 vs ₹4,150)

Two overlapping populations:

1. **Shared-invoice SRA** (this case, Almas last-write): two or more SRs whose CN funded one invoice, `linked_sale_id` last-write-wins to that invoice, visible SR remaining = `net − full invoice SRA` instead of allocated slice. Banner undercounts by the other SR’s contribution (here ₹1,000).
2. **Adjusted+linked with CAB leftover > 0:** skip drops the leftover from recon; Unclaimed still sums CAB. Maseera’s live CN/119 leftover is **0** after RCP/4838, so Maseera’s ₹1,000 gap is class (1), not class (2).

### 4.3 CN Adjust date bug

Every invoice with `sale_return_adjust > 0` whose `credit_note_adjustment` `voucher_date` ≠ `sales.sale_date`. Not org-locked.

Dry-run (SQL editor, read-only) — do not mutate:

```sql
-- Class 4.1: missing ledger SR rows (adjusted + linked)
SELECT
  sr.organization_id,
  o.name AS org_name,
  COUNT(*) AS adjusted_linked_sr_count,
  COUNT(DISTINCT sr.customer_id) AS customer_count
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
WHERE sr.deleted_at IS NULL
  AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
GROUP BY 1, 2
ORDER BY adjusted_linked_sr_count DESC;
```

```sql
-- Class 4.2a: two+ SRs sharing one linked invoice (banner remaining undercount)
SELECT
  sr.organization_id,
  o.name AS org_name,
  sr.customer_id,
  c.customer_name,
  sr.linked_sale_id,
  s.sale_number,
  s.sale_return_adjust,
  COUNT(*) AS sr_count,
  SUM(sr.net_amount) AS sr_net_sum
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
JOIN public.customers c ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
JOIN public.sales s ON s.id = sr.linked_sale_id AND s.organization_id = sr.organization_id
WHERE sr.deleted_at IS NULL
  AND sr.linked_sale_id IS NOT NULL
GROUP BY 1, 2, 3, 4, 5, 6, 7
HAVING COUNT(*) >= 2
ORDER BY o.name, c.customer_name;
```

```sql
-- Class 4.2b: adjusted+linked SRs that still have CN leftover (skip + CAB remainder)
SELECT
  sr.organization_id,
  o.name AS org_name,
  sr.customer_id,
  c.customer_name,
  sr.return_number,
  sr.credit_status,
  sr.net_amount,
  sr.credit_available_balance,
  GREATEST(0, cn.credit_amount - cn.used_amount) AS cn_live_remaining,
  s.sale_number AS linked_invoice
FROM public.sale_returns sr
JOIN public.organizations o ON o.id = sr.organization_id
JOIN public.customers c ON c.id = sr.customer_id AND c.organization_id = sr.organization_id
LEFT JOIN public.credit_notes cn ON cn.id = sr.credit_note_id AND cn.deleted_at IS NULL
LEFT JOIN public.sales s ON s.id = sr.linked_sale_id
WHERE sr.deleted_at IS NULL
  AND LOWER(COALESCE(sr.credit_status, '')) = 'adjusted'
  AND sr.linked_sale_id IS NOT NULL
  AND GREATEST(
        COALESCE(sr.credit_available_balance, 0),
        COALESCE(cn.credit_amount, 0) - COALESCE(cn.used_amount, 0)
      ) > 0.5
ORDER BY o.name, c.customer_name, sr.return_date;
```

```sql
-- Class 4.3: CN applied on a different day than the invoice (mis-dated CN Adjust row)
SELECT
  ve.organization_id,
  s.sale_number,
  s.sale_date AS invoice_date,
  ve.voucher_date AS cn_voucher_date,
  ve.voucher_number,
  ve.total_amount
FROM public.voucher_entries ve
JOIN public.sales s
  ON s.id = ve.reference_id
 AND s.organization_id = ve.organization_id
WHERE ve.deleted_at IS NULL
  AND ve.voucher_type = 'receipt'
  AND ve.payment_method = 'credit_note_adjustment'
  AND s.deleted_at IS NULL
  AND ve.voucher_date IS DISTINCT FROM s.sale_date
ORDER BY ve.organization_id, ve.voucher_date DESC
LIMIT 200;
```

---

## 5. What not to do yet

- Do not delete or rewrite SR/159.
- Do not widen `isSaleReturnConsumedAtBilling` without checking SHAHIN / billing-absorb cases (that skip exists to stop double credit).
- Do not treat banner ₹3,150 as cash-refundable only, or Unclaimed ₹4,150 as wrong — Unclaimed matches CN/120 live remaining; banner matches truncated ledger remaining (`net − full linked SRA`).
- Do not assume removing the skip self-corrects Credit balance.
- Do not run `reconcile_variant_stock_qty` or any bulk money repair.

Next (when asked): population SQL results, then a remainingCredit change that uses allocated CN not full invoice SRA (without reintroducing billing double-count), plus dating `cn_adjusted` from `voucher_date`, plus a tracing row for adjusted+linked SRs that does not add `t.credit`.

---

## Phase 0 fixtures (no production code)

Tests in `test/money/maseeraLedgerReconstruction.test.ts` lock the **correct** figures (SR/159 memo credit 0; SR/160 remaining / banner / Unclaimed all ₹4,150; `cn_adjusted` date = voucher_date).

**Phase 1 landed** in `fetchCustomerLedgerTransactionsWithClient`: tracing memo instead of skip; remaining from allocated CN (`saleReturnConsumedForRemaining`); `cn_adjusted` dated from the CN voucher clock. `isSaleReturnConsumedAtBilling` is unchanged.

Read-only population SQL: `scripts/maseera-ledger-population-scope-20260918.sql` is the combined reference. The SQL editor ran **only the last statement** on the 18 Sep 2026 paste (same class as the KS `DO $$` 42601 failure). Use one file per run:

| Paste order | File | Class | Live result (18 Sep 2026) |
| --- | --- | --- | --- |
| 1a | `scripts/maseera-pop-1a-dropped-sr-headline.sql` | adjusted + linked SRs (ledger skip / now memo) | **300 rows / 13 orgs** (customer_count sum 265) |
| 1b | `scripts/maseera-pop-1b-dropped-sr-cn-leftover.sql` | skip + CN leftover > 0.5 (Maseera CN/119 leftover is 0 — should be absent) | **21 rows / 4 orgs / 21 customers. MASEERA absent** |
| 2a | `scripts/maseera-pop-2a-misdated-cn-headline.sql` | `voucher_date` ≠ `sale_date` | **116 rows / 108 invoices / 87 customers / 5 orgs** |
| 2b | `scripts/maseera-pop-2b-misdated-cn-sample.sql` | sample 200 of 2a (INV/3122 should appear) | **116 rows (full 2a, under cap).** MASEERA INV/3122 = 09/09 vs RCP/4837 18/09 |
| 3a | `scripts/maseera-pop-3a-split-sra-detail.sql` | two+ SRs share one `linked_sale_id` | **11 invoices** (detail of 3b) |
| 3b | `scripts/maseera-pop-3b-split-sra-headline.sql` | headline counts for 3a | **11 customers / 4 orgs / 11 split invoices** |

Query 3b is not Maseera-only.

### Live 1a — skip / memo class (300 rows)

| Org | dropped_sr_rows | customers |
| --- | ---: | ---: |
| ELLA NOOR | 144 | 128 |
| ALBELI FASHION LADIES WEAR | 73 | 67 |
| VELVET EXCLUSIVE LADIES WEAR & BAGS | 30 | 26 |
| KS FOOTWEAR | 27 | 21 |
| SACCHI FASHION | 6 | 5 |
| DEMO | 5 | 4 |
| SAAJ SILK & DESIGNER SAREES | 4 | 4 |
| Gurukrupa Silk Sarees | 3 | 3 |
| RANAWAT'S BLING | 2 | 1 |
| GOPI ETHNIC COLLECTION | 2 | 2 |
| TIRTHA COSMETICS | 2 | 2 |
| YOUR CHOICE GIFT & TOYS | 1 | 1 |
| AAMAN | 1 | 1 |

Phase 1 turns these into tracing memos (`credit: 0`) when remaining is 0. Not a money-row repair.

### Live 1b — skip + leftover (21 rows)

MASEERA is **not** in this set (CN/119 leftover is 0 after RCP/4838). Four orgs: ELLA NOOR 18, SACCHI 1, TIRTHA 1, VELVET 1.

Eighteen ELLA NOOR rows have CN live remaining ≈ net (status `adjusted` + linked, CN unused). That is a different shape from Maseera: skip hid a leftover that Unclaimed still sums. Residual risk after Phase 1: if allocated CN is 0, `saleReturnConsumedForRemaining` falls back to linked invoice SRA and can still zero the leftover. Do not treat 1b as self-corrected without a reprint.

### Live 2a / 2b — CN Adjust date

2a `IS DISTINCT FROM` compares raw `sale_date` to `voucher_date`. 2b is the full 116 rows (not truncated).

Calendar-day split of 2b:

- **100 true cross-day** (MASEERA class)
- **16 same calendar day** (timestamptz `sale_date` vs date `voucher_date` — query noise, not a print-date bug)

Cross-day by org: ELLA NOOR 79, KS FOOTWEAR 18, DEMO 1, VELVET 1, Gurukrupa 1. Distinct customers 76, invoices 92.

Confirmed first 2b row: **MASEERA / INV/26-27/3122 / invoice 2026-09-09 / RCP/26-27/4837 voucher 2026-09-18 / ₹8,400**. ALMAS MOTIWALA INV/26-27/3064 is 15/09 vs 16/09 (RCP/4801).

Phase 1 dates `cn_adjusted` from `voucher_date`, so the 100 cross-day rows reprint on the apply day.

### Live 3a / 3b — shared `linked_sale_id` (11 invoices / 4 orgs)

SRA **below** SR-net sum (banner undercount shape — allocated leftover, not full invoice SRA):

| Org | Customer | Invoice | SRA | SR net sum | Returns |
| --- | --- | --- | ---: | ---: | --- |
| ELLA NOOR | MASEERA | INV/26-27/3123 | 10700 | 23250 | SR/159, SR/160 |
| ELLA NOOR | DR.SADAF GODIL | INV/26-27/2988 | 3800 | 6500 | SR/79, SR/152 |
| ELLA NOOR | AMRIN BAIG | INV/26-27/1324 | 3450 | 5400 | SR/59, SR/97 |
| ELLA NOOR | Shaista Arif Reshmawala | INV/26-27/2676 | 12750 | 13000 | SR/129, SR/130 |

Six more share a linked invoice with SRA ≈ SR-net (RUBINA, Saba Ali, SHUMAMA, Tanvi Taufu, KS FOOTWEAR `Ks`, RANAWAT SWAPN). ALBELI SHRADDHA has SRA **above** SR-net and a null `return_number` — not the Maseera undercount.

Dual-run extract fixtures (`test/helpers/customerLedgerExtractDualRun.ts`) now include MASEERA and the cross-day CN-adjust date case (20 patterns). QueryFn body ↔ golden.txt ↔ generated inline must stay in sync; dual-run is the lock that both implementations emit SR/159 memo, SR/160 remaining ₹4,150, and `cn_adjusted` on `voucher_date`.
