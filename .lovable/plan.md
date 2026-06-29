## Investigation: phantom CN adjustments double-counted as Sale Returns

### Root cause

On **2026-06-06** a cleanup script (`cn_over_apply_repair_20260606`) identified that several voucher receipts of type `credit_note_adjustment` were **not backed by any real credit note / sale return**. The script appended a note to each row reading:

> `[cn_over_apply_repair_20260606] phantom credit_note_adjustment receipt removed (audit: ella_noor_cn_over_applied_invoices.csv)`

…but it **never actually deleted the `voucher_entries` rows, and never reverted the matching `sales.sale_return_adjust` values**. The annotation was added in place, then the cleanup stopped. As a result:

- `sales.sale_return_adjust` still contains the phantom CN amount.
- The Customer Ledger Report computes `CN/SR Applied on Invoices = Σ sales.sale_return_adjust`, which now includes both real returns and these phantoms.

For **KHADIJA SHEIKH** this shows up as ₹10,500 applied when the only real sale-return is **SR/25-26/19 for ₹5,250**. The extra ₹5,250 is three phantom CN receipts on invoices `INV/856 (₹650)`, `INV/903 (₹4,500)`, and `INV/1194 (₹100)` — all tagged "phantom" but still live.

```text
INV/25-26/585  ← SR/25-26/19 (REAL)   sale_return_adjust = 5,250
INV/25-26/856  ← RCP/26-27/439 (PHANTOM)  sale_return_adjust =   650
INV/25-26/903  ← RCP/26-27/438 (PHANTOM)  sale_return_adjust = 4,500
INV/25-26/1194 ← RCP/26-27/440 (PHANTOM)  sale_return_adjust =   100
                                          ─────────────────────────
                                          Σ                   10,500
```

### True balance for KHADIJA SHEIKH

After removing the ₹5,250 phantom inflation:

```text
Opening                          +   1,750
(+) Invoices (Σ net_amount)      +1,04,800
(−) CN/SR Applied (REAL only)    −   5,250
(−) Cash / UPI / Bank received   −  40,900
(−) Advance Adjusted             −  52,450
(±) Balance Adjustments          −  11,050
                                 ─────────
Outstanding (Cr)                 −   3,100
```

**Corrected balance = ₹3,100 Cr** (shop owes customer), not ₹8,350 Cr.

### Why the earlier audit missed it

The previous balance reconciliation used `reconcile_customer_balances` and `get_customer_true_outstanding`, both of which read `sales.sale_return_adjust` as the authoritative "returns applied" figure. They had no cross-check against the `sale_returns` table count or the existence of a backing `credit_notes` row. The phantom rows passed every existing parity gate because they self-balance (voucher receipt offsets sale_return_adjust). The audit step that compares Σ sale_return_adjust vs Σ sale_returns.net_amount per customer was not part of the canonical recipe.

### Same issue across ELLA NOOR — 23 customers, ₹1,46,800 total phantom CN

| Customer | Phantom CN Receipts | Inflated by |
|---|---:|---:|
| AMNA DARVESH | 1 | ₹13,500 |
| Muskan | 2 | ₹12,100 |
| Sharmin Mewara | 1 | ₹11,300 |
| GULNAZ | 1 | ₹10,500 |
| MAHENOOR KAS | 1 | ₹10,500 |
| Amrin | 1 | ₹9,200 |
| OSAMA | 1 | ₹8,600 |
| QURRATUL AIN BANGALORE | 1 | ₹7,500 |
| Shanawaz Memon | 1 | ₹7,000 |
| Mahi Supariwala | 1 | ₹6,500 |
| Ruby Bhatia | 2 | ₹6,200 |
| **KHADIJA SHEIKH** | **3** | **₹5,250** |
| FIZA CHAUDHARY | 1 | ₹4,500 |
| SAMEENA MADHIYA | 1 | ₹4,500 |
| PRIYANKA YADAV | 2 | ₹4,400 |
| Naeem Mukadam | 1 | ₹3,950 |
| Nazbin Choudhury | 1 | ₹3,600 |
| Hanif bhai | 1 | ₹3,200 |
| Sadiqa Faisal Khan | 1 | ₹3,200 |
| Arezah Nathani | 2 | ₹3,200 |
| Sadiya Surat | 1 | ₹3,200 |
| AYESHA MERCHANT | 1 | ₹3,100 |
| SABINA SAMEER | 1 | ₹1,800 |
| **Total** | **29** | **₹1,46,800** |

These customers' current displayed "CN/SR Applied" / outstanding figures are wrong by the amounts shown. The phantom voucher rows are flagged in `voucher_entries.notes` containing the marker `cn_over_apply_repair_20260606 phantom credit_note_adjustment receipt removed`.

### Proposed fix (for separate approval — no changes yet)

Two-step idempotent migration scoped to ELLA NOOR (org `3fdca631-…`) and the phantom marker:

1. **Reverse `sales.sale_return_adjust`** by the phantom voucher amount for each affected `sale_id` (decrement, with `GREATEST(0, sale_return_adjust − phantom_total)` guard to avoid going negative).
2. **Soft-delete the 29 phantom `voucher_entries` rows** (`deleted_at = now()`, audit note appended). This preserves history per the project's Soft Delete Policy.
3. **Recompute payment status** for each touched sale via `compute_sale_settlement(sale_id)`.
4. **Recompute customer balance snapshot** for the 23 affected customers.
5. **Add a permanent parity check** (`docs/customer-balance-verification-recipe.md` + `scripts/audit-balance-formula-parity.sql`) that flags any future drift where `Σ sales.sale_return_adjust > Σ sale_returns.net_amount + Σ credit_notes.used_amount` per customer.

Want me to switch to build mode and execute this 5-step repair?
