
## Diagnosis (confirmed via reconcile RPC)

Ledger closing ₹5,000 is correct. Breakdown for Madiha Nursumar (id `0c57…9237`, org Ella Noor):

| Source | Amount |
|---|---|
| Opening balance | +₹42,000 |
| Total invoiced (6 bills) | +₹27,950 |
| Sale-return adjust on invoices | −₹14,950 |
| Balance adjustments (2 entries) | −₹50,000 |
| **Net outstanding** | **₹5,000** ✓ |

Invoices today:
- INV/25-26/30 — ₹3,000 **pending**
- INV/25-26/65 — ₹5,800 **pending**
- INV/25-26/389 — ₹6,500 completed (fully S/R adjusted)
- INV/25-26/549 — ₹3,950 completed (S/R adjusted)
- INV/25-26/522 — ₹4,500 completed (S/R adjusted)
- INV/26-27/1859 — ₹4,200 **pending**

**Root cause of the display mismatch:** the ₹50,000 was entered via *Balance Adjustment* (writes `outstanding_difference` only). It reduces the net receivable but is **not linked to any invoice or to the opening balance**, so the sales dashboard keeps showing opening ₹42,000 unpaid and three invoices Not Paid.

## Fix (data-only, one-off, no code change)

Convert the two balance adjustments into proper Customer Receipt vouchers and allocate FIFO. Closing balance stays ₹5,000.

Steps (single migration, wrapped in a transaction, Ella Noor + Madiha scoped only):

1. **Soft-delete the two `customer_balance_adjustments` rows** (₹42,000 dated 03-Jun 05:46 PM and ₹8,000 dated 03-Jun 05:49 PM) so the ₹−50,000 line disappears from the ledger.
2. **Create two `voucher_entries` receipts** (payment method carried from original adjustments — "Other/Cash" per notes), dated 03-Jun-2026 to preserve history, with allocations:
   - Receipt A ₹42,000 → applied fully to **Opening Balance** (`reference_type='customer'`, no sale link).
   - Receipt B ₹8,000 → FIFO across pending invoices:
     - INV/25-26/30 ₹3,000 (full)
     - INV/25-26/65 ₹5,000 (partial; ₹800 remains)
3. **Run `applyRecomputedSalePaymentState`** (via `compute_sale_settlement`) for INV/25-26/30, /65, /1859 so `paid_amount` / `payment_status` re-derive from the new receipts.
4. **Verify** — re-run `reconcile_customer_balance` and expect:
   - Opening balance line drops to ₹0 (fully receipted)
   - INV/25-26/30 → Paid, /65 → Partial ₹800 due, /1859 → Pending ₹4,200
   - Net outstanding = ₹5,000 (unchanged) ✓

## Question before I write the migration

The ₹5,000 residual has to sit on **one or two invoices**. Two clean options:

- **Option A (FIFO, above):** /65 keeps ₹800 pending, /1859 keeps ₹4,200 pending. Two bills still show pending.
- **Option B (latest-only):** Pay opening ₹42,000 + /30 ₹3,000 + /65 ₹5,000 partial → same as A.
- **Option C (single pending bill):** Pay opening ₹42,000 + /30 ₹3,000 + /65 ₹5,800 (full) = ₹50,800. Requires bumping the adjustment total to ₹50,800 (₹800 extra) so only /1859 ₹4,200 remains pending. This **changes closing to ₹4,200** — violates your "don't touch ₹5,000" rule, so not recommended unless you want closing = ₹4,200.

Confirm **Option A** (default) or tell me which invoice should carry the ₹5,000 residual, and I'll write the migration.
