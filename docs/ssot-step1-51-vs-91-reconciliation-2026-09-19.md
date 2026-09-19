# Step 1 — materialise the "51" and diff it against the 91 (19 Sep 2026)

**No mutate.** Group A blocked on bucket (g). Santosh on his own thread. The 365 tender-only rows are parked.

## Where "51 / ₹2,99,467" came from

| Pass | Rule | Result | In repo? |
| --- | --- | --- | --- |
| 18 Sep definition A | receipts on the bill > `net − SRA` by > ₹1, all time, 4 orgs | 168 bills / ₹7,91,754 | headline only (`docs/duplicate-receipt-audit-2026-09-18.md`) |
| 18–19 Sep CN-netted resize | same, with CN-application receipts netted against `sale_return_adjust` | 53 / ₹3,06,217 → **51 / ₹2,98,467** | headline only (`docs/duplicate-receipt-step2-fix-2026-09-19.md`) |
| 19 Sep SHREEVASTAV correction | +₹1,000 for the GREATEST hole on POS/875 | **51 / ₹2,99,467** | one named row |

The SQL that produced 51 and its `sale_number` list were **never committed**. Only the 29-30 May window scripts (`scripts/shreevastav-dup-*.sql`) exist, and their receipt predicate is `payment_method IS DISTINCT FROM 'credit_note_adjustment'` — CN netted, **advance-application memos counted as cash**, **at-sale tender not added**.

So the old rule, as best it can be reconstructed:

```
OLD_51  over = receipts_cn_netted − (net − SRA) > 1
```

and the confirmed set:

```
SET_91  over = receipts_memo_excl + tender − (net − SRA) > 1, receipts_memo_excl > 0
```

## What the 21:09 CSV already says about the diff (before the live paste)

The 21:09 scan carries both `receipts_live` (memo-excluded) and `net_due`, so `OLD_51`'s membership can be replayed on it — except for advance-memo rows, which the scan excluded and cannot see.

| Replay on the 21:09 CSV | Bills | ₹ |
| --- | --- | --- |
| `receipts_memo_excl − net_due > 1` (OLD_51 rule on memo-excluded receipts) | **48** | ₹1,62,086 |
| `SET_91` | **91** | ₹2,98,108.51 |
| in SET_91, not in OLD_51 rule | **43** | — |

Neither 48 / ₹1,62,086 nor any other local replay reproduces 51 / ₹2,99,467. The ₹ near-match between SET_91 and the old headline is therefore **not** confirmed as the same population — it can only be settled by the live paste, which sees the advance-memo receipts the CSV does not.

The 43 SET_91-only bills are all `NEW_ONLY_AT_SALE_TENDER`: receipts alone ≤ net, receipts + at-sale tender > net.

| Shape of the 43 | Bills | What the old rule did |
| --- | --- | --- |
| RECEIPT_DUPLICATES_AT_SALE_TENDER (tender = receipt = net, or receipt ≤ tender excess) | 29 | Invisible — GREATEST(receipts, tender) discards the at-sale leg. HEENA 1488 / 1594 / 1714, ANANYA 1787, `5d17dd09` 1326 / 1579 / 2023 / 849, `b9bd7c57` 667 … |
| MIXED_TENDER_PLUS_RECEIPT_OVER | 14 | Invisible — same hole. VIMLA 765 (RCP/1126 ₹400), `07e95598` 134 ₹3,000, `3ba2dcc5` POS/26-27/93 ₹4,000 (the `ensureAtSaleTenderReceipt` comment case), `c6633e62` 185 ₹3,000 … |

Old headline **missed all 43 entirely** — **₹1,15,181** of over-credit the ledger and the printed bill both show (27 in B, 15 in A, 1 Santosh POS/717). This is the same hole that put SHREEVASTAV at ₹2,100 instead of ₹3,100, applied 43 more times.

## Live paste — `scripts/ssot-step1-materialise-51-vs-91-2026-09-19.sql`

Read-only. Returns:

- `headline`: today's OLD_51 count / ₹, SET_91 count / ₹, BOTH / OLD_ONLY / NEW_ONLY counts.
- `reason`: one row per diff reason with ₹ under each rule.
- `bill`: every bill in OLD_51 ∪ SET_91 with `diff_reason`, `shape`, receipts under both rules, `advance_memo_counted_by_old`, tender, net_due, paid_amount.

Reason codes:

| Code | Meaning | Action |
| --- | --- | --- |
| BOTH | in both | proceeds to the group A/B gate as already classified |
| OLD_ONLY_ADVANCE_MEMO | old counted an advance-application memo as cash; without it the bill is not over-credited | **drop from the working list** — not a duplicate; the advance was real money applied once |
| OLD_ONLY_OTHER | old only, other reason (receipt moved since 18 Sep, SRA changed, …) | hand-check each |
| NEW_ONLY_AT_SALE_TENDER | the GREATEST hole | **add to the working list** — already in A or B from the 21:09 scan |
| NEW_ONLY_OTHER | should be empty | hand-check each |

Expected: BOTH ≈ 48, NEW_ONLY_AT_SALE_TENDER ≈ 43, OLD_ONLY_* = the advance-memo rows (unknown count until pasted). If today's OLD_51 headline is not 51 / ₹2,99,467, the delta is listed row by row — not averaged away.

## Close-out rule

Nothing from the old list is silently dropped: every OLD_ONLY row is listed with its reason. Nothing is double-handled: a bill appears once in the `bill` section, with one `diff_reason` and one `shape`, and its group (A / B / Santosh / walk-in / NDZ) is the customer-level gate from the 21:09 scan — the old headline's membership does not override that gate.

## Step 2a is prepared but not run

`scripts/ssot-step2-group-b-dry-run-2026-09-19.sql` — read-only dry run for Group B (49 customers / 57 bills / ≈ ₹1,75,637 expected). Do not run it until this step-1 paste is reviewed. Leg rule and customer-atomic status are locked in `test/money/ssotStep2GroupBLegWalk.test.ts`. The mutate script does not exist yet and will not be written until the dry-run output is reviewed and five rows across different shapes are hand-checked.
