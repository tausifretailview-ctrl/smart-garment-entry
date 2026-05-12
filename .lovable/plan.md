
## Investigation Result — ELLA NOOR Organization

I scanned every customer in ELLA NOOR for "advance adjustment" receipts that exceed the customer's actual advance balance. Besides Faiza Sheikh (already fixed), **2 more customers** are affected by the same defect.

### Affected Customers

**1. Naseem Jahid — ₹8,000 phantom adjustment**

Real advances received:
- ADV/25-26/0281 — ₹1,100 (fully used)
- ADV/25-26/0662 — ₹17,700 (fully used)
- **Total real advance = ₹18,800, all consumed**

Advance-adjustment receipts created against sales:
| Voucher | Sale | Amount | Date |
|---|---|---|---|
| RCP/25-26/726 | INV/25-26/203 | ₹3,300 | 2026-03-02 |
| RCP/25-26/727 | INV/25-26/525 | ₹14,400 | 2026-03-02 |
| RCP/26-27/674 | INV/26-27/611 | ₹3,200 | 2026-05-07 |
| RCP/26-27/717 | INV/26-27/386 | ₹5,900 | 2026-05-09 |
| **Total adjusted** |  | **₹26,800** |  |

Excess = 26,800 − 18,800 = **₹8,000 phantom**. The two newest receipts (RCP/26-27/674 ₹3,200 + RCP/26-27/717 ₹5,900 = ₹9,100) are the suspect entries created after both real advances were already exhausted. The likely correction is to reverse those two and (if needed) trim one to fit available balance.

**2. Moshin Khan — ₹3,950 phantom adjustment**

- Real advances received: **₹0** (no row in `customer_advances`)
- RCP/26-27/359 against INV/25-26/1433 — ₹3,950 on 2026-04-23 — **fully phantom**

### Root cause
Same defect already fixed for Faiza Sheikh: the old Sales Dashboard / Bulk Adjust / Customer Payment screens computed "Available Advance" as `bookingBalance + creditBalance` (mixing ledger overpayment with booked advances) and never re-checked `customer_advances.amount − used_amount` at write time. The frontend guard is now in place going forward, but the historical bad rows remain in the database.

### Proposed cleanup (requires your approval)

For each phantom voucher I will, in one transaction:
1. Soft-delete the voucher (`voucher_entries.deleted_at = now()`).
2. Reverse its accounting journal lines.
3. Reset the impacted sale to `paid_amount = 0` (or reduce by the reversed amount), `payment_status = 'pending'`, `payment_method = 'pay_later'`.
4. Leave real `customer_advances` rows untouched.

Specifically:
- **Moshin Khan:** reverse RCP/26-27/359 entirely → INV/25-26/1433 becomes pending ₹3,950.
- **Naseem Jahid:** reverse RCP/26-27/717 (₹5,900) and RCP/26-27/674 (₹3,200) → INV/26-27/386 and INV/26-27/611 become pending. Net excess removed = ₹9,100; remaining ₹1,100 over-allocation (since true excess is ₹8,000) means after reversal Naseem will have ₹1,100 unused advance which can be re-applied later if needed. Alternative: reverse only RCP/26-27/717 (₹5,900) and trim RCP/26-27/674 from ₹3,200 to ₹1,100 to leave zero remaining advance — please tell me which you prefer.

### Out of scope
- No code changes (frontend guard already deployed).
- No changes to other organizations (this audit is ELLA NOOR only).
- I will run the same scan org-wide if you ask.

### Question for you
For **Naseem Jahid**, which cleanup do you want?
- **A)** Reverse both RCP/26-27/717 and RCP/26-27/674 (simplest; leaves both invoices pending and ₹1,100 of advance free for future use).
- **B)** Reverse RCP/26-27/717 (₹5,900) and trim RCP/26-27/674 to ₹1,100 (uses the last ₹1,100 of legitimate balance against INV/26-27/611, leaves only INV/26-27/386 pending).

Reply with A or B (and confirm Moshin Khan reversal) and I will execute the cleanup.
