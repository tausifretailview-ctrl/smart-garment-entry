

## Fix: Customer Ledger CN Attribution for Multi-SR Adjustments

### Audit findings (Ella Noor org)

Scanning all customers, **5 customers** have CN-applied vs SR-amount mismatches. The previous fix correctly handles 4 (Hanif, Priyanka, Arezah, Sharmin — partial unused balance). The 5th, **Amrin**, exposes a deeper bug:

| Customer | SR | Net | Applied (voucher) | Issue |
|---|---|---:|---:|---|
| Hanif bhai | SR/26-27/11 | 6,250 | 3,200 | ✅ fixed (partial unused 3,050) |
| Priyanka Yadav | SR/26-27/9 | 4,400 | 3,900 | ✅ fixed (partial unused 500) |
| Arezah Nathani | SR/26-27/4 | 3,200 | 50 | ✅ fixed (partial unused 3,150) |
| Sharmin Mewara | SR/25-26/39 | 13,450 | 1,950 | ✅ fixed (partial unused 11,500) |
| **Amrin** | SR/25-26/21 + SR/26-27/3 | 6,400 + 2,800 | 9,200 (single voucher on INV/25-26/733) | ❌ phantom pending |

Amrin's case: invoice INV/25-26/733 was billed with `sale_return_adjust = ₹9,200` (both SRs applied at billing time). The voucher row credits ₹9,200 against INV/25-26/733. But **SR/26-27/3 has no `linked_sale_id`**, so the current allocator only attributes ₹6,400 (from SR/25-26/21 which is linked); the remaining ₹2,800 of voucher remains "unattributed" and SR/26-27/3 wrongly shows as ₹2,800 Pending CN — even though the customer already used it on INV/25-26/733.

### Fix

In `src/components/CustomerLedger.tsx` (`srAppliedMap` builder, lines ~796-816):

1. **Two-pass allocation** within the customer's SRs:
   - **Pass 1** (existing): Allocate CN voucher remaining-by-sale to SRs whose `linked_sale_id` matches that sale (chronological).
   - **Pass 2** (new): For any voucher remainder still on a sale (i.e., `remainingBySale[saleId] > 0` after pass 1), distribute it across this customer's *unlinked* SRs (chronological by date) up to each SR's `net_amount`. Tag those SR entries with the sale they were applied to (using `linkedSaleMap[saleId]`).

2. Result: Amrin's SR/26-27/3 will show "Applied to INV/25-26/733 ₹2,800" (Credit) and SR/25-26/21 will show "Applied to INV/25-26/733 ₹6,400" — both fully accounted, no phantom pending CN, balance reconciles.

### Technical changes

- **`src/components/CustomerLedger.tsx`** — extend the `srAppliedMap` builder to add Pass 2: after the existing chronological allocation against linked SRs, iterate remaining `cnVoucherBySaleId` balances and allocate to unlinked SRs of the same customer in chronological order. No DB changes; presentation-only fix that uses already-existing data (voucher rows + SR rows).

### Out of scope

- Cleanup of the 4 already-fixed customers (no action needed — display now correct).
- Auto-linking historical unlinked SRs to their billing-time invoice via `sales.sale_return_adjust` (would need a backfill migration; current presentation fix avoids needing it).

