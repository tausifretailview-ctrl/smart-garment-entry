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

After 1128/1129 repair, C-SNAP can still read **₹16,750** (true ₹16,250 + the ₹500 824 artefact) until that drift matches C-JS.

---

## 3. Payment Receipt pending is trustworthy — and it is not C-JS

**Select Invoices** pending is `getInvoiceOutstanding` → `reconcileSaleInvoiceWithSplit` → `reconcileSaleInvoiceDisplay` (`src/utils/customerBalanceUtils.ts`), same leftover as Sales Invoice Dashboard. Filter: `outstanding >= ₹1`. For POS/1903 (no extra sale receipts) that is `max(at-sale, stored paid − voucher buckets)` = ₹1,000 against net ₹17,250 → **₹16,250**.

That is the **this-bill leftover** family, the same number as print `invoiceThisBillBalance(17250, 1000)`. It is **not** customer-level `getCustomerAccountState`.

Print Total Due ₹16,250 is that leftover plus `previousBalance`. On reprint, `previousBalance = C-JS outstanding − thisBill`, which is ₹14,150 − ₹16,250 = **−₹2,100**, then Gurukrupa Outstanding/Total Due still **adds this-bill leftover**. The photographed ₹16,250 is the invoice leftover, not proof that live C-JS equals ₹16,250.

**Account at a glance** on the same RCP screen is C-JS (`CustomerAccountSummaryStrip` / `fetchCustomerAccountStateView`) and shows **₹14,150**. Same screen, two families.

---

## Migration order (evidence)

Converge **invoice leftover** (Select Invoices + print this-bill Balance) as the payment target. It independently matched the printed bill on POS/1903.

Do **not** treat Account at a glance / POS search as that same number. C18 C-JS is ₹14,150 here (GREATEST). C21 C-SNAP is ₹14,650 (GREATEST + 824 drift). C-RECON is ₹13,150 (both dups). After the 51-bill repair of 1128+1129, leftover on 1903 stays ₹16,250; C-JS should move to ₹16,250; C-SNAP still needs the 824 at-sale drift before it matches.
