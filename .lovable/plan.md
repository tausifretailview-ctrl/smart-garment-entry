

## Fix: Invoice Dashboard Not Accounting for Credit Note Adjustments

### Problem
When a credit note (sale return) is applied against an invoice, `sale_return_adjust` is updated on the sale record. However, the Invoice Dashboard ignores this field everywhere — showing inflated pending balances and incorrect payment statuses.

**Example**: SADIQA's invoice ₹4,500 with ₹1,300 paid + ₹3,200 credit note should show ₹0 pending and "Completed", but currently shows ₹3,200 pending and "Partial".

### File: `src/pages/SalesInvoiceDashboard.tsx`

All changes apply the formula: `pending = net_amount - paid_amount - sale_return_adjust`

### Changes (10 locations)

1. **Page totals balance** (line 833) — Add `- (inv.sale_return_adjust || 0)` with `Math.max(0, ...)`

2. **Excel export** (line 864, 901) — Add `sale_return_adjust` to select query; fix Balance column; add "Credit Note Adj." column

3. **Table row pending** (line 2041) — Add `- (inv.sale_return_adjust || 0)`

4. **openPaymentDialog** (line 1396) — Subtract `sale_return_adjust` from pending

5. **Advance mode pending** (line 1416) — Subtract `sale_return_adjust`

6. **Credit note mode pending** (line 1462) — Subtract `sale_return_adjust`

7. **Payment guard + status** (lines 1487, 1501) — Factor `sale_return_adjust` into pending check and status determination (`completed` when `paid + cn_adjust >= net`)

8. **Payment dialog "Pending" display** (line 2147) — Subtract `sale_return_adjust`

9. **Second payment dialog "Pending"** (line 2905) — Subtract `sale_return_adjust`

10. **WhatsApp balance queries** (lines 1251, 1367) — Add `sale_return_adjust` to select; include in `totalPaid` sum; fix fallback calculations (lines 1374, 1377)

### Verification
After fix, SADIQA's INV/25-26/443: `4500 - 1300 - 3200 = 0` → status "completed" ✓

### Not Changed
- Sale return recording logic
- CustomerLedger, PurchaseBillDashboard
- Invoice print templates

