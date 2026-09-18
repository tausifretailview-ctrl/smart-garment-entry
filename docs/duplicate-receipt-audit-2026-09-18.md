# Duplicate-receipt audit — read-only measurement (2026-09-18)

Scope: GURUKRUPA (`e8fbf0d8…`), VELVET (`dafc3d0c…`), KS FOOTWEAR (`4bc73037…`), ELLA NOOR (`3fdca631…`).
**No repair, no reversed vouchers, no schema/RPC/code changes were made.** All figures are live production reads.

---

## STEP 1 — the 30-May-2026 population, row by row

Method: pulled every active receipt voucher (`voucher_entries`, `voucher_type='receipt'`,
`reference_type='sale'`, `deleted_at is null`) created 2026-05-29 → 2026-05-31 for GURUKRUPA and VELVET
(24 rows), joined each to its sale, then listed **every** receipt ever posted against those sales and
compared the total to the bill's own `net_amount − sale_return_adjust`. Each row below is reconstructed
from its own ledger history, not inferred from a pattern.

### Confirmed duplicates (receipt lands on a bill already settled in full)

| Org | Customer | Bill | Bill net | Earlier receipt | 30-May receipt | Over-credit |
|---|---|---|---|---|---|---|
| VELVET | (NULL — walk-in) | POS/26-27/85 | 15,862 | RCP/26-27/2 (08-Apr) | RCP/26-27/1139 | 15,862.00 |
| VELVET | JATIN BHAI KENYA | POS/26-27/808 | 13,699.90 | RCP/26-27/20 (13-May, card) | RCP/26-27/1131 | 13,700.10 |
| VELVET | DIYA | POS/25-26/123 | 11,000 | RCP/26-27/1 ₹10,000 (03-Apr) | RCP/26-27/1145 ₹10,000 | 9,000.00 |
| VELVET | RUCHI | POS/26-27/1116 | 5,570 | RCP/26-27/1104 (27-May, UPI) | RCP/26-27/1133 | 5,570.00 |
| VELVET | ANANYA TRIPATHI | POS/26-27/580 | 3,900 | RCP/26-27/14 (07-May) | RCP/26-27/1134 | 3,900.00 |
| VELVET | NIKKI PATEL | POS/26-27/558 | 3,300 | RCP/26-27/9 (29-Apr) | RCP/26-27/1143 | 3,300.00 |
| VELVET | ANANYA TRIPATHI | POS/26-27/536 | 3,149 | RCP/26-27/13 (07-May) | RCP/26-27/1136 | 3,149.00 |
| VELVET | HEENA PATEL | POS/26-27/853 | 2,770 | RCP/26-27/1124 (28-May) | RCP/26-27/1132 | 2,770.00 |
| VELVET | ANANYA TRIPATHI | POS/26-27/221 | 2,745 | RCP/26-27/12 (07-May) | RCP/26-27/1140 | 2,745.00 |
| VELVET | SAYALI MADAM | POS/26-27/610 | 2,299 | RCP/26-27/10 (01-May) | RCP/26-27/1135 | 2,299.00 |
| VELVET | REKHA SANCHETI | POS/26-27/416 | 2,000 | RCP/26-27/6 (25-Apr) | RCP/26-27/1137 | 2,000.00 |
| VELVET | SURESH | POS/26-27/378 | 1,977 | BCK/dcf49184 Phase-4 backfill (11-May) | RCP/26-27/1142 | 1,977.00 |
| VELVET | ANANYA TRIPATHI | POS/26-27/70 | 1,500 | RCP/26-27/11 (07-May) | RCP/26-27/1138 | 1,500.00 |
| VELVET | RUCHI | POS/26-27/292 | 570 | RCP/26-27/8 (28-Apr) | RCP/26-27/1141 | 570.00 |
| GURUKRUPA | SANTOSH ZADE | POS/25-26/1130 | 5,800 | RCP/25-26/1618 ₹5,500 (25-Mar) | RCP/26-27/1131-1 ₹5,800 | 5,500.00 |
| GURUKRUPA | SHREEVASTAV | POS/25-26/875 | 3,100 | RCP/25-26/799 ₹2,100 (05-Mar) | RCP/26-27/1128 ₹2,100 + 1129 ₹1,000 | 2,100.00 |

**Confirmed total: 16 bills, ₹78,942.10** — VELVET ₹71,342.10 (14 bills), GURUKRUPA ₹7,600 (2 bills).

Notes on the two partial cases: SANTOSH ZADE's March receipt was ₹5,500, the May re-entry was the full
₹5,800 → real over-credit ₹5,500, not ₹5,800. SHREEVASTAV's March receipt was ₹2,100, the May pair
totalled ₹3,100 → ₹1,000 of that was genuinely owed; real over-credit ₹2,100, not ₹3,100.

### Signature matches that are NOT duplicates (hand-cleared)

| Org | Customer | Bill | Why it is clean |
|---|---|---|---|
| VELVET | DOLLY JAIN | POS/26-27/454 | ₹4,500 bill, two genuine ₹1,500 instalments (24-Apr + 30-May); ₹1,500 still owed. Equal-amount instalment, not a duplicate. |
| GURUKRUPA | VIMLA YADAV | POS/26-27/765 | ₹2,600 + ₹400 on the same evening = exactly ₹3,000 split tender. |
| GURUKRUPA | SHREEVASTAV | POS/26-27/767 | Single ₹5,600 receipt, bill ₹5,600. |
| GURUKRUPA | SANTOSH GAIKWAD | POS/26-27/354 | Single ₹21,600 receipt, bill ₹21,600. |
| GURUKRUPA | JYOTI KOLI | POS/26-27/218 | ₹2,900 against a ₹3,900 bill — under-collected, opposite direction. |
| GURUKRUPA | SANTOSH ZADE | POS/25-26/717 | ₹6,000 twice, but bill is ₹81,200 with only ₹12,000 received — no over-credit; separate issue: `paid_amount` says 81,200 while receipts total 12,000. |

### The NULL-customer row
VELVET POS/26-27/85 (₹15,862, walk-in, no `customer_id`). The duplicate is real, but because the sale
carries no customer it touches **no customer ledger**. Its damage is confined to cash/receipt reporting
and settlement drift, not to anybody's outstanding.

### Two save paths, one window
GURUKRUPA rows were written 07:14–07:39 UTC (one of them by user `dc21336f…`); VELVET rows 11:34–11:41 UTC
in a tight 7-minute run of 15 consecutive voucher numbers (1131→1145), one bill every ~20 seconds — the
shape of an operator re-keying a list of old invoices, not of customers paying.

---

## STEP 2 — is the printed bill's balance protected? **No.**

Definitive, from source, not inference:

- The POS invoice print calls `fetchInvoicePrintAccountFacets` (`src/utils/customerAccountStateView.ts:113`)
  → `fetchCustomerAccountStateView` → `getCustomerAccountState` → `computeCustomerBalanceCore`.
- In `computeCustomerBalanceCore` (`src/utils/customerBalanceCore.ts:~400-490`), `receiptCredits` is the
  **raw sum of every receipt voucher** for the customer. There is no per-invoice cap anywhere in that path.
- The only per-invoice reconciliation is `computePaidAmountDrift` (line 219). It adds
  `gap = paid_amount − receiptsOnSale` **only when `gap > 0`** (line 245). A duplicate makes the gap
  negative, and negative gaps are discarded.

So a duplicate receipt reduces the C-JS balance rupee-for-rupee, and the printed "previous balance" is
under-stated by exactly the over-credit. Worked examples from the confirmed list: ANANYA TRIPATHI's printed
previous balance is understated by ₹11,294 (4 bills), RUCHI's by ₹6,140 (2 bills), JATIN BHAI KENYA's by
₹13,700.10. The ₹1 `BALANCE_MISMATCH_TOL` constant is a warning threshold only and does not clamp anything.

Conclusion: this bug class is **not** structurally contained. Every downstream surface that consumes C-JS
— printed invoice, POS previous balance, statements, salesman outstanding — inherits the under-statement.

---

## STEP 6 — sizing KS FOOTWEAR, VELVET, and (for scale) ELLA NOOR

Population definition A — **over-credited bills** (all receipts on the bill exceed
`net_amount − sale_return_adjust` by more than ₹1), all time, active sales only:

| Org | Over-credited bills | Receipts involved | Total over-credit | Largest single |
|---|---|---|---|---|
| ELLA NOOR | 116 | 190 | ₹6,26,950.00 | ₹38,000 |
| VELVET | 23 | 45 | ₹92,683.60 | ₹15,862 |
| KS FOOTWEAR | 18 | 43 | ₹50,721.01 | ₹11,939 |
| GURUKRUPA | 11 | 15 | ₹21,400.00 | ₹5,500 |
| **Total** | **168** | **293** | **₹7,91,754.61** | |

Population definition B — **exact-amount repeat receipts on the same bill** (the duplicate signature,
regardless of whether the bill ends up over-credited; includes legitimate equal instalments such as
DOLLY JAIN's, so this set is looser):

| Org | Duplicate groups | Extra receipts | Extra rupees | Date span |
|---|---|---|---|---|
| ELLA NOOR | 71 | 75 | ₹2,88,810 | 13-Feb → 18-Sep-2026 |
| KS FOOTWEAR | 21 | 27 | ₹2,27,991 | 25-Feb → 10-Sep-2026 |
| VELVET | 17 | 17 | ₹76,342 | 03-Apr → 15-Jun-2026 |
| GURUKRUPA | 7 | 7 | ₹16,100 | 25-Dec-2025 → 25-Jul-2026 |

Definition A is the money measure; definition B shows the behaviour is still live — the most recent
duplicate signature is **18-Sep-2026 (ELLA NOOR)** and **10-Sep-2026 (KS FOOTWEAR)**. This is not a
closed historical episode.

Worst-affected customers (definition A, ELLA NOOR + KS FOOTWEAR):

| Org | Customer | Bills | Over-credit |
|---|---|---|---|
| ELLA NOOR | SHUMAMA BAIRELI | 3 | ₹61,900 |
| ELLA NOOR | Moshin Khan | 2 | ₹28,800 |
| ELLA NOOR | MASEERA | 2 | ₹19,100 |
| ELLA NOOR | Naseem Jahid | 4 | ₹18,200 |
| ELLA NOOR | SIBGAH GEELANI | 1 | ₹14,000 |
| ELLA NOOR | Sharmin Mewara | 2 | ₹13,450 |
| ELLA NOOR | Faiza Sheikh | 2 | ₹13,100 |
| ELLA NOOR | Natasha Agahdi | 1 | ₹13,000 |
| KS FOOTWEAR | SHOE CHOICE-YOGINAGAR | 1 | ₹11,939 |

(MASEERA appears here at ₹19,100 despite an earlier targeted fix this session — worth a look before any
repair pass is designed, since it suggests either a second occurrence or an incomplete earlier correction.)

---

## What is NOT in this report
No repair, no voucher reversal, no RPC or invariant change, no data edit. The over-credit figures above are
measurements, not write instructions — several will need per-customer human judgement (genuine advance vs
mis-keyed duplicate), especially the ELLA NOOR long tail.
