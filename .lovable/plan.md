## Issue — KHADIJA SHEIKH (ELLA NOOR)

Sales Invoice Dashboard shows **Pending Amount ₹6,450** for KHADIJA SHEIKH, but the customer's actual outstanding is much lower. Investigation of the per-invoice balance formula reveals the dashboard ignores the `sales.credit_applied` column (the amount of CN / customer advance already applied to a specific invoice).

### Per-invoice breakdown for KHADIJA SHEIKH

| Invoice | Net | Paid | SR Adjust | Credit Applied | Dashboard Balance (current) | True Balance (correct) |
|---|---|---|---|---|---|---|
| INV/26-27/1629 | 3,800 | 2,600 | 0 | 0 | 1,200 | 1,200 |
| INV/25-26/1194 | 10,200 | 10,100 | 0 | **100** | 100 | 0 |
| INV/25-26/903 | 4,500 | 0 | 0 | **4,500** | 4,500 (shown "Not Paid") | 0 |
| INV/25-26/856 | 5,050 | 4,400 | 0 | **650** | 650 | 0 |
| INV/25-26/585 | 26,000 | 21,000 | 5,250 | 5,250 | 0 | 0 |
| **Total pending** | | | | | **6,450** | **1,200** |

The ₹11,050 legacy "balance adjustment" (`customer_balance_adjustments` row dated 2026-02-16) was correctly converted into advance ADV/25-26/0561 (₹4,950) plus an outstanding write-off. Those advances were then applied to invoices via `credit_applied` — but the dashboard balance column never subtracts it, so adjusted invoices stay visually "pending".

### Root cause

`src/pages/SalesInvoiceDashboard.tsx` computes balance in 4 places using:
```ts
Math.max(0, net_amount - paid_amount - sale_return_adjust)
```
Lines: 1280–1288 (page totals), 1375 (Excel export), 1923/1954/1977 (settlement dialog default), 2959–2968 (row Balance + status badge).

The correct formula must also subtract `credit_applied`:
```ts
Math.max(0, net_amount - paid_amount - sale_return_adjust - credit_applied)
```

The dashboard stats RPC (KPI cards) needs the same correction so the **Pending Amount** card matches.

### Similar customers in ELLA NOOR (org-wide impact)

Query found **22 customers / 27 invoices** with the same display bug:

| Customer | Inv | Credit Applied | Displayed Pending |
|---|---|---|---|
| AMNA DARVESH | 1 | 13,500 | 13,500 |
| Muskan | 2 | 12,100 | 12,100 |
| Sharmin Mewara | 1 | 11,300 | 11,300 |
| MAHENOOR KAS | 1 | 10,500 | 10,500 |
| GULNAZ | 1 | 10,500 | 10,500 |
| Amrin | 1 | 9,200 | 9,200 |
| OSAMA | 1 | 8,600 | 8,600 |
| QURRATUL AIN BANGALORE | 1 | 7,500 | 11,500 |
| Shanawaz Memon | 1 | 7,000 | 7,000 |
| Mahi Supariwala | 1 | 6,500 | 6,500 |
| Ruby Bhatia | 2 | 6,200 | 6,200 |
| **KHADIJA SHEIKH** | **3** | **5,250** | **5,250** |
| FIZA CHAUDHARY | 1 | 4,500 | 4,500 |
| SAMEENA MADHIYA | 1 | 4,500 | 4,500 |
| PRIYANKA YADAV | 2 | 4,400 | 4,400 |
| Naeem Mukadam | 1 | 3,950 | 3,950 |
| Nazbin Choudhury | 1 | 3,600 | 3,600 |
| Sadiya Surat | 1 | 3,200 | 3,200 |
| Hanif bhai | 1 | 3,200 | 3,200 |
| Sadiqa Faisal Khan | 1 | 3,200 | 3,200 |
| Arezah Nathani | 1 | 3,150 | 3,150 |
| SABINA SAMEER | 1 | 1,800 | 1,800 |

**Org totals — ELLA NOOR**: 27 invoices · ₹1,43,650 of credit-applied wrongly shown as outstanding · True org pending ≈ ₹4,000 (only KHADIJA's 1,629).

Note: this is a **display-layer bug only**. Customer master balance, ledger reconciliation, and `reconcile_customer_balances` already account for `credit_applied` correctly. No data repair required.

---

## Proposed Fix

### Frontend — `src/pages/SalesInvoiceDashboard.tsx`

1. **Update balance formula** in all 4 occurrences to also subtract `credit_applied`:
   - `balanceDue` helper (line 1280–1288)
   - Excel export row (line 1375)
   - Settlement dialog default amount (lines 1923, 1954, 1977)
   - Row Balance + payment status fallback (line 2959–2968)
2. Ensure the `sale_return_adjust` data already being selected also includes `credit_applied`. Check current SELECT list and add `credit_applied` if missing (line 1335 export query and primary list query).

### Backend — Dashboard stats RPC

3. Update `get_sale_order_dashboard_stats` (or the sales-invoice equivalent that powers the **Pending Amount ₹6,450** KPI card) to subtract `COALESCE(credit_applied,0)` from the pending computation. Apply via a migration that replaces the function definition.

### Verification

- Reload Invoice Dashboard for KHADIJA SHEIKH → Pending should drop from ₹6,450 to ₹1,200; INV 903/856/1194 should show Paid with ₹0 balance.
- Org-wide Pending Amount KPI should reduce by ≈₹1,43,650.
- No change to `customers.opening_balance`, `customer_advances`, `voucher_entries`, or ledger data.

### Out of scope (do not touch this turn)

- Customer Ledger report calculations — already correct.
- Master Reconciliation RPC — already correct.
- Any data migration / balance repair — not needed.
