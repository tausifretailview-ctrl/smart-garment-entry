# SHREEVASTAV POS search ₹14,650 Due — 19 Sep 2026

**Org:** GURUKRUPA SILK SAREES (`e8fbf0d8-182c-4364-8570-96c756b72db8`)
**Customer:** SHREEVASTAV 9819151882
**This pass:** identity only. No money-row mutate. Do not reverse RCP/1128 or RCP/1129.

Live screens (19 Sep 2026 afternoon IST):

| Surface | Figure | Family |
| --- | ---: | --- |
| Printed POS/26-27/1903 this-bill Balance / Total Due | **₹16,250** | this-bill leftover (`invoiceThisBillBalance`) |
| Payment Receipt **Select Invoices** pending (POS/1903) | **₹16,250.00** | per-invoice `reconcileSaleInvoiceWithSplit` |
| Payment Receipt **Account at a glance** | ₹14,150 | C-JS (`getCustomerAccountState.outstanding`) |
| Customer Ledger header / recon | ₹13,150 | C-RECON-LEDGER (sums at-sale + every receipt) |
| POS Sales customer search `₹X Due` | **₹14,650** | **C21 C-SNAP** (`grossOutstandingDr`) |

True remaining on open bill POS/1903 is ₹16,250 (net ₹17,250 − at-sale ₹1,000). Only that invoice is pending on the Payment Receipt picker.

---

## 1. Exact POS search query

Not a dedicated “due” RPC of its own.

1. Names come from `useCustomerSearch` → `customers` PostgREST (`CUSTOMER_SEARCH_COLUMNS`).
2. The rupee chip is `useCustomerBalances` in `src/hooks/useCustomerSearch.tsx`:
   `fetchCustomerFinancialSnapshotMap` → RPC **`get_customer_financial_snapshot_batch`** (`p_organization_id`, first 20 visible ids).
3. Display in `src/pages/POSSales.tsx`:

```ts
posFooterCustomerBalance(grossOutstandingFromFinancialSnapshot(snap))
```

`posFooterCustomerBalance` is `Math.round`. `grossOutstandingFromFinancialSnapshot` is C-SNAP `gross_outstanding_dr` (unused advance not subtracted). SHREEVASTAV unused advance is ₹0, so gross = signed = `outstanding_dr`.

Catalog **C21** already named this surface C-SNAP. It is **not** a ninth family. The inventory line still said `outstandingDr`; live code reads **`grossOutstandingDr`**.

SQL editor has **no JWT**. Per-customer `get_customer_financial_snapshot(id, org)` still runs `assert_org_member` → **42501 Authentication required** (same as `get_customer_true_outstanding`). Live paste 19 Sep 2026 18:10 IST (`query-results-export-2026-09-19_18-10-08_2ff6.csv`) used the tables-only file: **no RPC**, reconstructed C-SNAP signed = **₹14,650** = POS search Due.

| Component | Amount |
| --- | ---: |
| opening / adj / SRA / pending SR / CN / refunds / advances | ₹0 |
| total_invoiced | ₹34,350 |
| receipt_payments | ₹13,800 |
| paid_at_sale_drift | ₹5,900 |
| **reconstructed_snap_signed = reconstructed_gross_outstanding_dr** | **₹14,650** |

`34,350 − 13,800 − 5,900 = 14,650`. Unused advance ₹0, so gross = signed. That is C21, not a ninth family.

---

## 2. ₹1,600 vs true ₹16,250

Not “only one of the two duplicate receipts.”

POS/875 settlement GREATEST(vouchers, tender):

- Vouchers = RCP/799 ₹2,100 + RCP/1128 ₹2,100 + RCP/1129 ₹1,000 = ₹5,200
- Tender = ₹1,000
- GREATEST = ₹5,200 vs net ₹3,100 → **₹2,100 over-credit** (1128’s extra; 1129 replaces the discarded at-sale rather than stacking)

C-SNAP `paid_at_sale_drift` = `GREATEST(0, tender − sale receipts)`:

- POS/824: tender ₹500, RCP/1391 ₹3,000 → drift **₹0**. The ₹500 at-sale is dropped once a voucher exists. Leftover **₹500** stays in signed.

Identity:

```
16,250 − 2,100 (875 GREATEST) + 500 (824 at-sale dropped) = 14,650
```

Ledger ₹13,150 = ₹16,250 − ₹3,100 (both dups, at-sale **plus** receipts). C-JS glance ₹14,150 = ₹16,250 − ₹2,100 (GREATEST only). POS search is GREATEST **and** the 824 drift miss.

After 1128/1129 repair, C-SNAP does **not** fall to leftover. Drift is `GREATEST(0, tender − sale receipts)` and does not read `paid_amount`. RCP/799 stays on 875 (`1000 − 2100 → 0`) and RCP/1391 stays on 824 (`500 − 3000 → 0`), so both at-sales stay dropped → predicted **₹17,750** (`16,250 + 1,000 + 500`), not ₹16,750. Independent bucket-(g) fix. See migration-order §4.

---

## 3. Payment Receipt pending is trustworthy — and it is not C-JS

**Select Invoices** pending is `getInvoiceOutstanding` → `reconcileSaleInvoiceWithSplit` → `reconcileSaleInvoiceDisplay` (`src/utils/customerBalanceUtils.ts`), same leftover as Sales Invoice Dashboard. Filter: `outstanding >= ₹1`. For POS/1903 (no extra sale receipts) that is `max(at-sale, stored paid − voucher buckets)` = ₹1,000 against net ₹17,250 → **₹16,250**.

That is the **this-bill leftover** family, the same number as print `invoiceThisBillBalance(17250, 1000)`. It is **not** customer-level `getCustomerAccountState`.

Print Total Due ₹16,250 is that leftover plus `previousBalance`. On reprint, `previousBalance = C-JS outstanding − thisBill`, which is ₹14,150 − ₹16,250 = **−₹2,100**, then Gurukrupa Outstanding/Total Due still **adds this-bill leftover**. The photographed ₹16,250 is the invoice leftover, not proof that live C-JS equals ₹16,250.

**Account at a glance** on the same RCP screen is C-JS (`CustomerAccountSummaryStrip` / `fetchCustomerAccountStateView`) and shows **₹14,150**. Same screen, two families.

---

## Migration order (19 Sep 2026 correction)

**Status of this correction:** the 14650 identity (POS search = C-SNAP) landed earlier the same day. This section is the follow-up: leftover scope, C-JS demotion, compound SNAP bucket, four-family post-repair. It was **not** in the first 14650 pass.

### 1. Leftover is the this-bill payment target — not a drop-in customer-level SSOT

`reconcileSaleInvoiceWithSplit` is **one invoice**. Inputs: that sale’s `net_amount` / `sale_return_adjust` / `paid_amount` / at-sale tender + that sale’s receipt-split buckets. It has **no** opening balance, unused advance, unclaimed CN/SR pool, unallocated customer receipt, or sibling invoice.

On SHREEVASTAV it **equals** true customer AR (₹16,250) only because Select Invoices has a single pending bill (POS/1903) and the other lifetime legs are ₹0. That is a coincidence of this account, not a general identity.

**Does `SUM(open leftovers)` = customer outstanding?** Not as the function is written.

- Customer Balances list + KPI cards need opening, unused advance, unclaimed CN/SR, unallocated receipts, and a policy for invoice overpayments vs sibling bills.
- Owner Dashboard already warns: pending-invoice outstanding is not “full customer net (OB, advance, CN)”.
- Accounts Outstanding (C15) already **sums a simpler leftover** for aging, **adds opening** as a separate 90+ bucket, then **overwrites the customer headline with C-SNAP**. That is the existing proof leftover-sum is not the list/KPI number.

**Feasibility:** leftover is the likely **canonical this-bill / Select Invoices / print Balance** target (matched POS/1903 print exactly). Promoting it to org-wide Customer Balances / KPI **needs real work**: a customer-level aggregator = Σ invoice leftover + opening + unclaimed CN/SR − unused advance − unallocated credit, with an explicit overpay policy. Do not `SUM(leftover)` and call that C02/C12.

### 2. C-JS is demoted from “reliable reference”

Live Payment Receipt **Account at a glance** is C-JS `getCustomerAccountState.outstanding` = **₹14,150**. That is ₹2,100 short of the printed bill.

C-JS **sums every receipt voucher** (1128 and 1129 both land in `receiptCredits`) and then adds `computePaidAmountDrift` = `max(paid_amount, tender) − voucherSum` only when that gap is positive. On POS/875, voucherSum ₹5,200 already covers tender, so the ₹1,000 at-sale is **not** added again. Net extra credit vs true AR is **₹2,100** (1128). 1129 is absorbed as the GREATEST replacement for discarded at-sale — that is why C-JS is not as low as the ledger’s ₹13,150.

Earlier this session treated C-JS as the print’s trustworthy customer total. **Revise:** the photographed ₹16,250 is invoice leftover. C-JS glance is **also currently wrong**, smaller magnitude than ledger, same duplicate cluster.

Print `previousBalance` is C-JS outstanding minus this bill (₹14,150 − ₹16,250 = −₹2,100), then Gurukrupa Outstanding/Total Due still **adds this-bill leftover**. Print this-bill Balance can be right while C-JS is wrong.

### 3. New classification bucket — C-SNAP compound GREATEST + drift

Do **not** fold POS search ₹14,650 into (d) duplicate-receipt or FIFO-split SRA.

**Bucket (g) — C-SNAP compound GREATEST + `paid_at_sale_drift` miss** (two independent effects on one customer’s signed total):

| Effect | Invoice | Mechanism | Signed vs true ₹16,250 |
| --- | --- | --- | ---: |
| GREATEST over-credit | POS/875 | `LEAST(net, GREATEST(receipts, tender))` = ₹5,200 vs net ₹3,100 | **−₹2,100** |
| Drift drops at-sale | POS/824 | C-SNAP `GREATEST(0, tender − sale receipts)` = `GREATEST(0, 500−3000)` = **₹0** | **+₹500** |
| **Net (POS search Due)** | | | **₹14,650** (`16,250 − 2,100 + 500`) |

C-JS has only the first effect (₹14,150). Ledger has both duplicate legs as **sum** (₹13,150). C-SNAP is the only family that combines GREATEST over-credit **and** a second invoice’s dropped at-sale.

### 4. After 1128/1129 repair — four families do **not** all converge

Do not start the mutate here. Predicted SHREEVASTAV numbers **after both duplicates are gone**, with POS/1903 leftover unchanged:

| Family | Live now | After 1128+1129 gone | Converges on ₹16,250? |
| --- | ---: | ---: | --- |
| **Leftover** (Select Invoices / print this-bill) | 16,250 | **16,250** | Yes (never saw 1128/1129 on 1903) |
| **C-RECON-LEDGER** | 13,150 | **16,250** | Yes (sum: 13,150 + 3,100) |
| **C-JS** | 14,150 | **16,250** if `sales.paid_amount` on 875 still holds the ₹1,000 tender so drift gap restores it (`max(3100,1000)−2100 = 1000`). **₹17,250** if a GREATEST rewrite sets `paid_amount` to ₹2,100 (gap 0, at-sale lost). | Conditional — GREATEST writer is a **separate** defect |
| **C-SNAP** | 14,650 | **₹17,750** = 16,250 + 875 at-sale still dropped (`GREATEST(0,1000−2100)=0` while RCP/799 remains) + 824 at-sale still dropped (`GREATEST(0,500−3000)=0`) | **No.** Drift formula is independent of the duplicate vouchers |

Earlier line “C-SNAP still reads ₹16,750 after repair” was **understated**. SNAP drift does not read `paid_amount`. RCP/799 stays on 875, so 875 at-sale stays dropped too. Independent SNAP-drift fix required even after the 51-bill row is cleaned.

**SSOT implication:** converge **invoice leftover** first as the payment / this-bill canon. Do not migrate Customer Balances / KPI onto leftover until the aggregator in §1 exists. Do not use C-JS as the reference while GREATEST/tender-absorb still fires. Do not assume C-SNAP equals leftover after duplicate repair.
