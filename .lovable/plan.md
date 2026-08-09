# Anusha Pathan (Ella Noor) — advance balance flips between ₹2,450 and ₹0

## What the data actually says

Her three advance bookings:

| Booking | Amount | Used | Remaining |
|---|---|---|---|
| ADV/25-26/0070 | 10,950 | 10,950 | 0 |
| ADV/25-26/849 | 8,950 | 8,950 | 0 |
| ADV/26-27/574 | 12,350 | 9,900 | **2,450** |

So ₹2,450 is the correct available advance.

## Her actual balance after the fix

| Item | Amount |
|---|---|
| Opening balance | ₹0 |
| Invoices (11, none cancelled/deleted) | ₹92,500 billed, ₹92,500 settled |
| Invoice outstanding | **₹0** |
| Ledger (debit ₹58,400 vs credit ₹58,400) | **₹0** |
| Unused advance (ADV/26-27/574) | **₹2,450** |

**Net position: nothing owed, ₹2,450 advance held in her favour** — shown consistently as ₹2,450 in the header strip, the KPI card and the Advance Booking screen, on every date filter.

One caveat: this assumes the surviving 13-Apr-2026 refund of ₹5,450 was a genuine payout. It sits against a booking that was already fully consumed, so it cannot legitimately reduce her advances — it likely belongs against something else, or is itself a mis-entry. If you confirm it was never actually paid out to her, it gets reversed and the ₹2,450 stands unchanged. If it was paid out, it needs re-attributing to the correct booking, which does not change the ₹2,450 either — it only corrects the audit trail.

But there are also two **advance refund** rows against ADV/25-26/849 — a booking that is already fully used:

- 13-Apr-2026 · ₹5,450 · UPI · no reason
- 26-May-2026 · ₹5,450 · UPI · reason: "refund as on 13/4/2026"

The second is a re-entry of the first. Together they subtract ₹10,900 from her advance pool that was never available.

## Why the number flips

The page computes the advance figure in two different ways:

1. **Header strip ("Advance held" / "Balance")** — pool maths: total received − total used − **total refunds** = 32,250 − 29,800 − 10,900 = negative, clamped to **₹0**.
2. **"ADVANCE BALANCE" KPI card** — sum of per-booking remainders, refunds not considered = **₹2,450**.

A third path (the ledger rows feeding the KPI card) filters advances by `advance_date` against the selected date range, so a narrow date filter drops ADV/26-27/574 and that card shows ₹0 as well. Same customer, same screen, three answers depending on which block you read and which date filter is active.

This is not isolated: across Ella Noor, **49 of 115** advance-refund rows exceed the booking's remaining amount.

## The fix

**1. Correct her data (Ella Noor only, targeted)**
- Remove the duplicate 26-May-2026 refund of ₹5,450 (the re-entry).
- Reconcile the remaining 13-Apr refund against ADV/25-26/849: a refund must reduce that booking's available amount, not sit outside it. Confirm whether the ₹5,450 was genuinely paid back before deciding to keep or reverse it.

**2. Make the two calculations agree (application-wide)**
- Attribute refunds to the specific booking they belong to; a booking's remaining becomes `amount − used − refunded`, floored at 0, and the pool is the sum of those remainders. Header strip and KPI card can no longer disagree.
- Remove the `advance_date` range filter from the advance fetch that feeds the balance figures. Available advance is a position as-of-now, not a period total; the date filter should only affect which rows are listed, not the header/KPI numbers.

**3. Stop it recurring**
- Block refunding more than a booking's remaining amount at the database level, so a fully-used booking cannot be refunded again.
- Duplicate guard on the refund screen: same booking + same amount already refunded prompts a confirmation instead of silently creating a second row.

**4. Report on the other 48**
- Produce a read-only list of over-refunded bookings across Ella Noor (plus counts for other organisations) for your review. No bulk data edits without sign-off.

## Technical notes

- `src/utils/customerBalanceCore.ts` — `unusedAdvance` subtracts a global `advanceRefundedTotal` from the pool; switch to per-booking `max(0, amount − used − refunded)` summed.
- `src/utils/customerAccountStateView.ts` — `advanceLegs` remaining must use the same per-booking formula (currently ignores refunds).
- `src/components/CustomerLedger.tsx` (~line 1610) — the `customer_advances` query applies `gte/lte` on `advance_date`; the balance-feeding fetch must be unfiltered.
- New DB trigger on `advance_refunds`: `sum(refunds) <= advance.amount − advance.used_amount` at insert time.
- Data corrections applied as scoped statements with `organization_id = '<Ella Noor>'`.

## Order of work

1. Read-only report of over-refunded bookings (Ella Noor + org counts) — you review.
2. Code fix: unified per-booking advance maths, date filter removed from balance path.
3. DB guard + UI duplicate warning.
4. Approved data corrections for Anusha Pathan, then the wider list.