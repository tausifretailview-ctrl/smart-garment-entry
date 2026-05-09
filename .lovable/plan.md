## Investigation — AYESHA MERCHANT (Ella Noor)

### Raw data from DB
**Sales (3 invoices)**
| Invoice | Net | Paid | sale_return_adjust | credit_applied | Status |
|---|---|---|---|---|---|
| INV/26-27/407 | 10,450 | 10,450 (cash) | 0 | 0 | Paid |
| INV/26-27/574 | 3,100 | 0 | **3,100** | **3,100** | Pending (fully covered by CN) |
| INV/26-27/585 | 3,100 | 0 | 0 | 0 | Pending |

**Sale Returns**
| SR | Net | credit_status | linked_sale_id |
|---|---|---|---|
| SR/26-27/23 | **3,850** | `adjusted` | INV/574 |
| SR/26-27/22 | 6,600 | `pending` | — |

**Voucher receipts**: only one — RCP/453 = ₹10,450 cash for INV/407.

### Correct math
- Gross sales: 10,450 + 3,100 + 3,100 = **16,650** ✓ (matches dashboard "Total Sales")
- Cash received: **10,450** ✓ (matches "Total Paid")
- Sale returns issued: 3,850 + 6,600 = **10,450**
- CN actually consumed against an invoice: only **3,100** (SR/23 → INV/574 via `sale_return_adjust`)
- Outstanding invoice still pending: INV/585 = 3,100
- **Net refund/CR owed to customer = (16,650 − 10,450 cash − 10,450 returns) × −1 = ₹4,250**
  - Equivalent view: SR/23 leftover 750 + SR/22 6,600 − INV/585 3,100 = **₹4,250** (your number is correct)

### What the dashboard is showing (wrong)
- "₹3,500 credit balance — refund to customer" → **off by ₹750**
- "Advance Balance ₹3,500" → fake; no row exists in `customer_advances`
- "CN AVAILABLE ₹0.00" → wrong; SR/22 alone is ₹6,600 pending
- "Returns/CR ₹6,600" → only counts SR/22; ignores 750 leftover from SR/23

### Root cause
SR/26-27/23 (₹3,850) was marked `credit_status='adjusted'` and linked to INV/574, but INV/574's `sale_return_adjust` is only ₹3,100. The remaining **₹750 of credit was never split into a leftover pending row** (the partial-consume split in `useSaveSale.tsx` lines 220–262 didn't run — likely because SR/23 was edited to 3,850 *after* INV/574 was saved, or the credit was force-marked via `AdjustCreditNoteDialog`).

Downstream consequences:
1. `CustomerLedger.tsx:1875` — when `credit_status === 'adjusted'`, the SR is **fully skipped** from the ledger on the assumption that the linked invoice's `net_amount` already absorbs it. For SR/23 this assumption is false (3,850 ≠ 3,100), so 750 of CR vanishes from the ledger.
2. `useCustomerBalance` / `computeCustomerOutstanding` follow the same skip rule → customer balance under-credits by 750.
3. The "₹3,500 advance" banner and "CN Available 0" derive from this same broken figure (16,650 − 10,450 cash − 3,850 (full SR/23) − net of SR/22 reservation logic), not from real `customer_advances`.

### Where the data integrity broke
- `useSaveSale.tsx` line 209: `if (remaining >= srAmt - 0.01)` — full-consume branch should NOT have fired here (3,100 < 3,850), so the partial-split path should have created a 750 pending leftover row. It didn't, which means one of:
  - SR/23 was originally ₹3,100, INV/574 consumed it fully, then SR/23 was later edited up to ₹3,850 without re-running the split.
  - SR/23 was force-adjusted via `AdjustCreditNoteDialog.tsx:142` (sets `credit_status:'adjusted'` without splitting).
  - INV/574 was edited and `sale_return_adjust` lowered without un-adjusting the SR.

### Proposed fix (for your approval — code changes deferred to build mode)

**1. Data fix for AYESHA MERCHANT (one-time SQL)**
   - Reduce `SR/26-27/23.net_amount` from 3,850 → 3,100 (the part actually consumed by INV/574), keep `credit_status='adjusted'`.
   - Insert a new sibling sale_return row for the leftover ₹750: `credit_status='pending'`, `linked_sale_id=null`, `original_sale_number=SR/23`'s, same `customer_id`/`return_date`, `return_number=null`, notes "Pending balance after audit reconciliation".
   - Result: refund calc will show ₹4,250, CN Available will show ₹7,350 (750 + 6,600 less INV/585 3,100 still pending = 4,250 net refundable).

**2. Long-term guards (separate follow-up)**
   - `useSaveSale.tsx`: when an invoice's `sale_return_adjust` is reduced or invoice deleted, re-open the linked SR (set back to `pending` and restore unconsumed amount).
   - `AdjustCreditNoteDialog`: when full-amount adjust is forced but invoice net < SR net, automatically split the leftover into a pending sibling row (mirror the logic from `useSaveSale.tsx:220-262`).
   - Add a daily reconciliation check: for every `sale_returns` with `credit_status='adjusted'` and `linked_sale_id`, assert `net_amount == sales.sale_return_adjust`; surface drift in the audit report.

### Confirm
Reply approve to proceed with **(1) the data fix for AYESHA MERCHANT only**. The long-term guards in (2) can be a separate task — say so if you want them bundled.
