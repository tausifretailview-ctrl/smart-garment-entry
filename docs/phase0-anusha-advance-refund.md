# Phase 0 — Anusha Pathan Adv Refund ₹10,900

**Customer:** ANUSHA PATHAN `4751fce3-6453-49c1-bd16-e11ea2a67ee2`  
**Org:** ELLA NOOR  
**Date:** 2026-08-09

## Verdict: **Branch B — real `advance_refunds` rows (display is faithful)**

Evidence from exported ledger PDF `Anusha Pathan_Ledger_09-08-2026.pdf`:

| Date | Type | Ref | Amount |
|------|------|-----|--------|
| 13/04/26 | Adv Refund | ARF · ADV/… | ₹5,450 |
| 26/05/26 | Adv Refund | ARF (refund…) | ₹5,450 |
| **Total** | | | **₹10,900** |

`CustomerLedger.tsx` maps `type: 'adv_refund'` only from `fetchAdvanceRefundsForAdvances` → `advance_refunds` (combined list ~1953). Paths at ~2343 / ~2361 **render** that type; they do not invent it from advance applications.

Anon Supabase could not read `customer_advances` / `advance_refunds` (RLS). Staging/service-role should still run `scripts/anusha-advance-refunds.sql` and capture row ids before any repair.

## Why this cannot coexist with booking figures

| Advance | Amount | Used |
|---------|--------|------|
| ADV/25-26/0070 | ₹10,950 | ₹10,950 |
| ADV/25-26/849 | ₹8,950 | ₹8,950 |
| ADV/26-27/574 | ₹12,350 | ₹9,900 |
| **Unused booking** | | **₹2,450** |

Neither fully-used booking is ₹5,450; ADV/574 remaining is ₹2,450, not ₹5,450×2. The refund rows need human judgement (same class as Parishma duplicate receipts) — **do not auto-delete**.

## Effect on Unused Advance strip

`getCustomerAccountState` / core:

`unusedAdvance = max(0, amount − used − refunds)`

→ `32250 − 29800 − 10900 = 0`. Strip ₹0 is consistent with those refund rows existing. Restoring Unused Advance ₹2,450 requires **data repair** of the refund rows, not a second formula.

## Separate display bug (fixed in app — no data write)

Outstanding header/recon used **last running-balance row** while advance applications are memo-only (excluded from Dr/Cr). That left Outstanding ₹8,450 under lines that economically sum to ₹0. Fixed by deriving Outstanding from:

`opening + invoiced − CN/SR − cash − settlement discount − advance applied (± adjustments)`.
