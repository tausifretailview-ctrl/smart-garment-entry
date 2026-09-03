# UZMA KUDIA — advance reallocation (ELLA NOOR, 2026-09-03)

## Symptom
- Customer ledger PDF: **Balance ₹0**
- Sales Invoice Dashboard: **INV/26-27/2896 Partial / Balance ₹2,101**
- Sibling **INV/26-27/2841** shows Paid, DIS ₹2,101

## Cause
Cash + advance on 2841 exceeded net by ₹2,101; the same ₹2,101 was short on 2896.

| Invoice | Net | Cash | Advance | Applied | Gap |
|---------|-----|------|---------|---------|-----|
| INV/26-27/2841 | 19,149 | 4,149 (RCP/4116) | 17,101 (RCP/4303) | 21,250 | **+2,101** |
| INV/26-27/2896 | 17,300 | 4,300 (RCP/4323) | 10,899 (RCP/4304) | 15,199 | **−2,101** |

Advance booking ADV/748 = ₹28,000 (= 17,101 + 10,899). Account-level ledger nets to zero; per-invoice allocation does not.

`consumeAdvanceFIFO` previously capped only `Σ advance ≤ net`, so ₹17,101 was allowed even with ₹4,149 cash already on the bill.

## Repair script
`scripts/ella-noor-uzma-kudia-advance-realloc-20260903.sql`

1. Run **SECTION 1** dry-run in Supabase SQL editor (service role). Confirm both `GATE_OK` rows.
2. Uncomment **SECTION 2**, run inside a transaction, verify before `COMMIT`.
3. Run **SECTION 3** + invariant digest (`paid_diverges_from_receipts` must not rise).

Tag: `[uzma_adv_realloc_20260903]`

## Code prevention
`advanceApplicationRoomCap` + `consumeAdvanceFIFO` now subtract cash-like receipts from the advance room (UZMA case → room ₹15,000 not ₹19,149).
