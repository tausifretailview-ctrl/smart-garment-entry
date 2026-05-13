## Answer

### 1. CN fix coverage — yes, applies to all organizations going forward

The two code changes I shipped are global, not Ella-Noor-specific:

- **Sales Dashboard → Record Payment → "From Credit Note (CN)"** now reads only `sale_returns.credit_available_balance` for the available CN pool — the buggy second subtraction of `credit_note_adjustment` vouchers is removed. Every customer in every org now sees the correct remaining CN amount.
- **`handleRecordPayment` (CN branch)** now bumps `credit_notes.used_amount` (and flips status to `fully_used` when fully consumed), with snapshot/rollback if the GL post fails. This keeps the Customer Ledger "CN Available" card in sync for every future adjustment.
- **Backfill migration** already healed the 3 historical CNs across orgs that had `used_amount = 0` while their SR pool was partially consumed (CN/26-27/3 = 4750/4750, CN/26-27/4 = 4600/13500, CN/26-27/5 = 5900/14400).

So: yes — every future CN adjustment from the Sales Dashboard, in every organization, will keep `sale_returns.credit_available_balance` and `credit_notes.used_amount` in lockstep.

### 2. Advance adjustment flow — investigated, no similar bug

Audited the advance counterpart of the same code path:

| Step | CN flow (was) | Advance flow |
|---|---|---|
| Read available pool | `sale_returns.credit_available_balance` − vouchers (DOUBLE) | `customer_advances.amount − used_amount` only ✓ |
| Update master table on apply | none → ledger card stale ✗ | `applyAdvance` FIFO bumps `customer_advances.used_amount` ✓ |
| Voucher entry written | yes | yes |
| Sale `paid_amount` updated | no (uses `sale_return_adjust`) | yes |

DB sweep (all orgs) — looking for any customer whose `advance_adjustment` voucher totals exceed actual `customer_advances.used_amount`:

```
phantom_excess > ₹1 → 0 rows
```

Conclusion: the advance-adjustment path on the Sales Dashboard is structurally sound. It does not double-read pool sources, and `customer_advances.used_amount` is reliably incremented via `applyAdvance` (FIFO) in `useCustomerAdvances`. The previously cleaned-up phantom rows (Naseem 9100, Faiza 4600, Moshin 3950) were already reversed and no new drift has accumulated.

### What's still worth a quick follow-up (not bugs in the same class)

- **Naseem Jahid's "Advance Balance ₹5,800" vs your expected ₹1,100**: DB shows ADV/26-27/244 = ₹4,700 created on 13/05/2026 sitting completely unused (status = `active`, `used_amount = 0`). It's a real, unapplied advance booking — not a phantom. If this booking shouldn't exist (e.g., duplicate of a payment already adjusted elsewhere), say the word and I'll trace its origin and queue a reversal.
- **"Advance Balance (Cr) ₹7,000" header on the Customer Ledger**: this should auto-correct on the next refresh now that the CN backfill ran. If it still shows wrong after a hard refresh, I'll re-investigate the audit-formula path.

No further code changes proposed in this turn — pending your direction on the ₹4,700 advance and a refresh check on Naseem's ledger.
