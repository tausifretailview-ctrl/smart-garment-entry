# Supplier balance vs bill subledger reconciliation — Phase 0

**Date:** 2026-07-27  
**Scope:** Read-only investigation. No `UPDATE` / `INSERT` / DDL / migrations / `src/` edits.  
**Trigger case:** Supplier Payment UI for `27a7a71f-222a-44de-a63e-ef55637f2bed` (SARASWATI SAREE DEPOT LTD.), org `5e769632-a203-4a47-9d52-8c2bbdd1b23b`.

---

## Executive answer (one sentence)

**This is an architecture / formula-class divergence (systemic wherever returns, CN adjust, or voucher-less `paid_amount` exist), not a one-supplier data typo — but live multi-org row counts could not be finished from this checkout without a service-role SQL session; appendix SQL is ready.**

---

## 0A. Design: customer “Pure Outstanding” vs supplier snapshot

### What exists on the customer side

There is **no** checked-in file at `/areas/accounting-architecture.md`. The closest shipped design is:

| Artifact | Role |
|----------|------|
| `src/utils/customerBalanceCore.ts` → `getCustomerAccountState` | Client four-facet model |
| `get_customer_financial_snapshot` / `get_customer_true_outstanding` (SQL) | Headline UI / lifetime outstanding |
| `docs/customer-accounts-consistency-v1.md` + `mem/features/accounts/customer-balance-logic.md` | CN / `sale_return_adjust` / voucher writer rules |

`getCustomerAccountState` exposes the intended separation (commented as Outstanding Dr, advance pool, unclaimed SR, net):

```519:548:src/utils/customerBalanceCore.ts
export function getCustomerAccountState(...) {
  // outstanding / netReceivable
  // unusedAdvancePool
  // unclaimedSaleReturnCredit
  // netPosition = balance - unusedAdvance
}
```

There is **no** DB function literally named `get_customer_account_state`; prior diagnoses map that name to `getCustomerAccountState` + financial snapshot RPCs.

### Supplier-side equivalent?

**No.** Supplier money is a **single signed `balance`**:

```258:260:src/utils/supplierBalanceUtils.ts
const balance = roundMoney(
  openingBalance + totalPurchases - totalPaid - totalCreditNotesNet - unreflectedReturns - refundsReceived
);
```

Mirrored 1:1 in `get_supplier_party_balances` (`supabase/migrations/20260910120000_get_supplier_party_balances.sql`).

The payment screen then **re-derives a second number** for the bill list:

- raw bill due → `getSupplierBillRawOutstanding`
- FIFO credit pool → `allocateSupplierCreditToBills`
- pool = `unappliedCreditNotes + Σ(adjusted_outstanding return nets)` (`SupplierPaymentTab.tsx`)

That is exactly the conflation the customer four-number model was written to avoid: **one header “net position”** (can go deep credit) shown beside **floored subledger payable** (never negative), as if they were the same question.

**Verdict (0A):** design gap, not a one-off bug. Supplier never received the customer-side “Pure Outstanding” treatment.

---

## 0B. Formula trace and SARASWATI arithmetic

### B1. `computeSnapshotForSupplier` (`supplierBalanceUtils.ts`)

| Term | Include | Exclude / notes |
|------|---------|-----------------|
| `openingBalance` | `suppliers.opening_balance` | — |
| `totalPurchases` | All non-deleted, non-cancelled bills for supplier (`net_amount`) | Cancelled filtered at fetch |
| `totalPaid` | Per bill: **if** any bill-linked payment voucher settlement &gt; 0 → use voucher sum; **else** use `purchase_bills.paid_amount`. Plus supplier-level payment vouchers whose `reference_id = supplierId` and description does **not** contain a bill number | Receipts are not “paid”; CN vouchers are not “paid” |
| `totalCreditNotesGross` | `voucher_type=credit_note`, `reference_id=supplierId` | — |
| `creditNotesAppliedToBills` | Returns with `credit_status === 'adjusted'` **and** `linked_bill_id` **and** `credit_note_id` | Amount = full CN voucher if `credit_available_balance` is **NULL**; else `voucher − remainder` |
| `totalCreditNotesNet` | `max(0, gross − appliedToBills)` | Floor at 0 |
| `creditNotesAppliedToOutstanding` | Same CN voucher amount for every return with `credit_status === 'adjusted_outstanding'` | Used only to shrink **unapplied** pool, **not** removed from `totalCreditNotesNet` |
| `unreflectedReturns` | Return `net_amount` when status ∈ `{adjusted, adjusted_outstanding, refunded}` **and** no matching CN voucher id | Pending returns **not** included |
| `refundsReceived` | Supplier `receipt` vouchers | — |
| **`balance`** | `OB + purchases − paid − cnNet − unreflected − refunds` | **Can be negative** (credit / overpayment). No per-bill floor |

**Pending vs `adjusted_outstanding`:** pending returns do not affect snapshot unless somehow voucher-linked via other terms. `adjusted_outstanding` keeps the CN inside `totalCreditNotesNet` (full subtract from payable).

### B2. Bill subledger (`supplierBillOutstanding.ts` + payment tab pool)

| Step | Rule |
|------|------|
| `getSupplierBillRawOutstanding` | `max(0, net − max(paid_amount, bill_voucher_paid))` — **floors at 0** |
| Credit pool | `unappliedCreditNotes + Σ net_amount of returns with credit_status=adjusted_outstanding` |
| `allocateSupplierCreditToBills` | Sort by `bill_date` ASC; allocate `min(raw, remaining)` per bill; **netPayable floors at 0**; leftover credit is **silent** (not shown as header credit) |
| Listed bills | Only rows with raw outstanding &gt; ₹0.01 |

**Pending returns:** not in the AO sum. **`adjusted_outstanding`:** full `net_amount` enters the pool (ignores `credit_available_balance`).

### B3. Hand arithmetic (user-measured quantities)

| Quantity | Amount (₹) |
|----------|------------|
| Header snapshot `balance` | **−2,75,869** |
| Bill list Σ netPayable | **1,26,012.50** |
| Raw outstanding (7 unpaid) | 2,15,567 |
| Credit allocated onto those bills | 89,554.50 |
| All purchase returns (7) | 1,04,790 |
| Of which `adjusted_outstanding` (6) | 87,426.15 |
| Supplier-level CN vouchers (1) | 17,363.85 |
| Bill-level payment vouchers (2) | 22,285 |

Checks that close:

- `215567 − 89554.50 = 126012.50` (allocator math matches the UI).
- `87426.15 + 17363.85 = 104790` (all return value sits in AO + one CN voucher).

**UI gap:**

```text
126012.50 − (−275869) = 401881.50  ≈ ₹4.02 lakh
```

**Which term creates ~₹4L?** Structurally it is **not** “missing vouchers alone” or “CAB alone”; it is the **difference in definitions**:

1. Header subtracts **full** `totalCreditNotesNet` (+ any unreflected returns) from **all** purchases, and counts **`paid_amount` on every bill** when vouchers are absent (`totalPaid` rule).
2. Bill list only shows **remaining** due on unpaid bills after FIFO of a **different** credit pool (AO return nets + unapplied CN), and **throws away** leftover credit after bills hit zero.

So the same economic credit (returns ≈ ₹1.05L) and the same inflated / voucher-less `paid_amount` mass on the 21 “paid” bills can reduce the header far below zero **while** unpaid bills still show ~₹1.26L due — because leftover credit and “paid” history live in the header equation, not in the floored subledger total.

**Can both formulas be “right”?** Only as answers to **different questions**:

| Question | Prefer |
|----------|--------|
| “How much cash should I tender against open bills today?” | **Subledger** (bill list) |
| “What is my signed net position with this supplier (Tally party balance)?” | **Snapshot** — *if* its inputs are not double-counting |

Given 21 bills marked paid vs ₹22,285 of payment vouchers, and CN adjust-to-bill writing `paid_amount` **without** a payment voucher, the snapshot’s `totalPaid` path is **vulnerable to over-subtraction** relative to true cash. Combined with always subtracting CN net, the header is the more dangerous number when the two disagree.

**Working conclusion:** treat the **contradiction as a product bug** (two definitions, one screen). Prefer **subledger for pay actions**; treat large header credits with open bills as **double-count / conflation alarms**, not instructions to skip payment.

---

## 0C. Scope — one supplier or systemic?

### Live probe from this checkout (publishable key only)

| Check | Result |
|-------|--------|
| `get_supplier_party_balances('5e769632-…')` | HTTP 200, **15** suppliers; **no** SARASWATI / `27a7a71f-…` |
| Same for Ella Noor gate org | 7 suppliers; no SARASWATI |
| Direct `SELECT` on `suppliers` / `purchase_bills` / `purchase_returns` | HTTP 200, **`[]`** (RLS) |
| Service role key in `.env` | **Absent** |

So **ranked divergence tables for every org could not be executed here**. That is an access limitation, not evidence of uniqueness.

### Structural (code) scope — what *will* diverge

Any supplier with **any** of:

- (a) purchase returns, especially `credit_status = 'adjusted_outstanding'`
- (b) `credit_status = 'adjusted'` with `credit_available_balance IS NULL` (legacy “full apply” semantics vs partial)
- (c) `paid_amount` ≫ bill-linked payment vouchers (CN-to-bill, read-path sync, dashboard payment, floating payment)
- (d) non-zero `opening_balance` interacting with supplier-level payments

…can show **header ≠ Σ bill netPayable**. SARASWATI is a loud instance of (a)+(c), not a unique snowflake.

**Classification:** **architecture fix** (unify facets / one definition on the payment screen). Data repair may still be needed for voucher-less `paid_amount` drift, but counting “how many suppliers” requires the appendix SQL under a privileged session.

### Appendix SQL (read-only) — run in Supabase SQL editor

```sql
-- 0C: snapshot balance vs subledger-derived payable, all suppliers / all orgs
-- Bound: soft-deleted excluded; cancelled bills excluded. Expect multi-second on large tenants.

WITH bills AS (
  SELECT pb.organization_id, pb.supplier_id, pb.id AS bill_id,
         COALESCE(pb.net_amount,0)::numeric AS net,
         COALESCE(pb.paid_amount,0)::numeric AS paid,
         pb.bill_date
  FROM purchase_bills pb
  WHERE pb.deleted_at IS NULL
    AND pb.supplier_id IS NOT NULL
    AND (pb.is_cancelled IS NULL OR pb.is_cancelled = false)
),
bill_vouchers AS (
  SELECT ve.organization_id,
         trim(ve.reference_id::text) AS bill_id,
         SUM(GREATEST(0, COALESCE(ve.total_amount,0)+COALESCE(ve.discount_amount,0)))::numeric AS vpaid
  FROM voucher_entries ve
  WHERE ve.deleted_at IS NULL
    AND lower(ve.voucher_type)='payment'
    AND lower(COALESCE(ve.reference_type,'')) IN ('supplier','supplierpayment','supplier_payment','purchase')
  GROUP BY 1,2
),
raw AS (
  SELECT b.organization_id, b.supplier_id, b.bill_id, b.bill_date,
         GREATEST(0, b.net - GREATEST(b.paid, COALESCE(bv.vpaid,0)))::numeric AS raw_os
  FROM bills b
  LEFT JOIN bill_vouchers bv
    ON bv.organization_id = b.organization_id AND bv.bill_id = trim(b.bill_id::text)
),
ao_pool AS (
  SELECT pr.organization_id, pr.supplier_id,
         SUM(COALESCE(pr.net_amount,0))::numeric AS credit_pool
  FROM purchase_returns pr
  WHERE pr.deleted_at IS NULL
    AND lower(trim(COALESCE(pr.credit_status,''))) = 'adjusted_outstanding'
  GROUP BY 1,2
),
-- FIFO allocation in SQL (oldest bill first) via running sum
ordered AS (
  SELECT r.*,
         COALESCE(a.credit_pool,0) AS pool,
         SUM(r.raw_os) OVER (
           PARTITION BY r.organization_id, r.supplier_id
           ORDER BY r.bill_date NULLS FIRST, r.bill_id
           ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW
         ) AS cum_raw
  FROM raw r
  LEFT JOIN ao_pool a USING (organization_id, supplier_id)
  WHERE r.raw_os > 0.01
),
allocated AS (
  SELECT organization_id, supplier_id,
         SUM(
           GREATEST(0,
             raw_os - GREATEST(0, LEAST(raw_os, pool - (cum_raw - raw_os)))
           )
         )::numeric AS subledger_payable
         -- NOTE: this AO-only pool understates unappliedCreditNotes; extend with CN net logic for full parity.
  FROM ordered
  GROUP BY 1,2
),
snap AS (
  SELECT organization_id, out_supplier_id AS supplier_id, out_signed_balance AS snapshot_balance
  FROM organizations o
  CROSS JOIN LATERAL _get_supplier_party_balances_rows(o.id) s
  -- If CROSS JOIN orgs is too heavy, filter o.id = '<org>' first.
)
SELECT
  s.organization_id,
  s.supplier_id,
  s.snapshot_balance,
  COALESCE(a.subledger_payable, 0) AS subledger_payable,
  ROUND(COALESCE(a.subledger_payable,0) - s.snapshot_balance, 2) AS divergence
FROM snap s
LEFT JOIN allocated a USING (organization_id, supplier_id)
WHERE ABS(COALESCE(a.subledger_payable,0) - s.snapshot_balance) > 1
ORDER BY ABS(COALESCE(a.subledger_payable,0) - s.snapshot_balance) DESC
LIMIT 200;
```

**Honest limitation of the sketch:** the payment tab pool also includes `unappliedCreditNotes` (CN gross − applied-to-bill − AO − refunded). The sketch uses AO nets only; extend before trusting ranks. Prefer implementing the comparison in a **SECURITY DEFINER read RPC** that reuses `_get_supplier_party_balances_rows` plus the TS allocator ported to SQL.

Correlation flags (same session):

```sql
-- (a) has returns
-- (b) has adjusted_outstanding
-- (c) paid_amount vs voucher payments
-- (d) opening_balance <> 0
SELECT
  s.id AS supplier_id,
  s.organization_id,
  COALESCE(s.opening_balance,0) AS opening_balance,
  EXISTS (
    SELECT 1 FROM purchase_returns pr
    WHERE pr.supplier_id = s.id AND pr.deleted_at IS NULL
  ) AS has_returns,
  EXISTS (
    SELECT 1 FROM purchase_returns pr
    WHERE pr.supplier_id = s.id AND pr.deleted_at IS NULL
      AND lower(trim(COALESCE(pr.credit_status,''))) = 'adjusted_outstanding'
  ) AS has_ao_returns,
  (
    SELECT COALESCE(SUM(pb.paid_amount),0) FROM purchase_bills pb
    WHERE pb.supplier_id = s.id AND pb.deleted_at IS NULL
      AND (pb.is_cancelled IS NULL OR pb.is_cancelled = false)
  ) AS sum_paid_amount,
  (
    SELECT COALESCE(SUM(ve.total_amount + COALESCE(ve.discount_amount,0)),0)
    FROM voucher_entries ve
    JOIN purchase_bills pb ON trim(ve.reference_id::text) = trim(pb.id::text)
    WHERE pb.supplier_id = s.id AND ve.deleted_at IS NULL
      AND lower(ve.voucher_type)='payment'
  ) AS sum_bill_payment_vouchers
FROM suppliers s
WHERE s.deleted_at IS NULL;
```

---

## 0D. Every writer of `purchase_bills.paid_amount`

| Location | Posts `voucher_entries` payment? | Notes |
|----------|----------------------------------|-------|
| `SupplierPaymentTab.tsx` ~490 | **Yes** (payment voucher after bill updates) | Canonical pay flow |
| `SupplierPaymentTab.tsx` ~675 / ~698 | Reversal when deleting vouchers | Paired with voucher delete |
| `SupplierPaymentTab.tsx` ~246–255 | **No** | **Write inside bills `queryFn` (read path)** — syncs `paid_amount`/`payment_status` to `max(paid_amount, voucherPaid)` capped at net. Opening the Supplier Payment tab **can mutate** rows whenever drift &gt; ₹0.009 |
| `FloatingPayments.tsx` ~858 | **Yes** (supplier payment voucher in same flow) | |
| `PurchaseBillDashboard.tsx` ~1323 | **Yes** (payment voucher insert follows) | Dashboard “record payment” |
| `AdjustCreditNoteDialog.tsx` ~176–182 | **No payment voucher** | Writes `paid_amount` for CN→bill; may create/update **`credit_note`** voucher, not `payment` |
| Soft-delete / cancel paths | N/A | Do not treat as settlement writers |

**Read-path write (`SupplierPaymentTab` 246–255):** yes, merely opening the tab with `tabActive` can change `paid_amount` / `payment_status` as a side effect. Direction is usually “raise paid to match vouchers or keep higher paid”; it does **not** create vouchers. It can **cement** voucher-less high `paid_amount` (from CN adjust) into “paid” status and keep snapshot `totalPaid` elevated.

---

## 0E. `purchase_returns.credit_available_balance`

### Writers (purchase returns)

| Path | Sets CAB? |
|------|-----------|
| `AdjustCreditNoteDialog` when adjusting **to bill** | **Yes** — `credit_available_balance: cnRemainder` |
| Adjust to **outstanding** / refund | **No** — status only (`adjusted_outstanding` / `refunded`) |
| `PurchaseReturnEntry` save | **No references** — new returns typically leave CAB **NULL** |
| Migrations `20260510120001_*`, `20260606163240_*` | Historical backfill `NULL → net_amount` (one-time) |
| Bill cancel unlink trigger | Restores CAB to `net_amount` |

Sale-return CAB healers (`saleReturnCnBalance.ts`, etc.) are **customer** paths — out of scope except as contrast: suppliers never got the same heal loop.

### Readers

- `supplierBalanceUtils` / party-balances SQL: NULL ⇒ treat CN→bill apply as **full voucher amount**
- `purchaseBillReturnAdjust.ts`, `purchaseReturnCnDisplay.ts`, `purchaseSupplierLedgerCn.ts`
- `PurchaseReturnDashboard` / ledgers for display

### Org-wide NULL rate

Could not run `count(*)` here (RLS). Run:

```sql
SELECT
  count(*) AS returns_total,
  count(*) FILTER (WHERE credit_available_balance IS NOT NULL) AS cab_not_null,
  count(*) FILTER (WHERE credit_available_balance IS NULL) AS cab_null,
  count(*) FILTER (
    WHERE credit_available_balance IS NULL
      AND lower(trim(COALESCE(credit_status,''))) = 'adjusted'
  ) AS null_cab_but_adjusted_to_bill
FROM purchase_returns
WHERE deleted_at IS NULL;
```

User observation (7/7 NULL for SARASWATI) matches “create return without CAB + AO path never writes CAB.”

---

## Ranked divergent suppliers

**Not populated from live multi-org SQL** (see 0C access limits). Placeholder for the privileged run:

| Rank | org_id | supplier_id | supplier_name | snapshot | subledger | \|Δ\| | flags |
|------|--------|-------------|---------------|----------|-----------|-------|-------|
| — | — | — | *run appendix SQL* | — | — | — | a/b/c/d |

Known loud case (user measurement only):

| Rank | supplier | snapshot | subledger | \|Δ\| |
|------|----------|----------|-----------|-------|
| 1 | SARASWATI `27a7a71f-…` | −2,75,869 | 1,26,012.50 | ≈ 4,01,882 |

---

## Which formula is correct?

**Neither alone is a safe single number on that screen.**

1. **Design-correct long term:** customer-style facets — Outstanding (subledger), Unapplied CN / AO credit, Refunds, Net Position — with **one** RPC.
2. **Operationally correct for “pay now”:** bill subledger after FIFO.
3. **Snapshot `balance`:** correct as a *party net* only if `totalPaid` and CN netting never double-count; today CN→bill via `paid_amount` + CN voucher netting is careful for `credit_status='adjusted'`, but AO + voucher-less paid + NULL CAB make the single number untrustworthy next to the bill list.

---

## Recommended fix list (impact ÷ risk)

| Priority | Type | Action |
|----------|------|--------|
| 1 | **Design change** | Split Supplier Payment header into facets (Payable / Credit available / Net) matching customer Pure Outstanding; stop labeling snapshot as if it were Σ bill due |
| 2 | **Code fix** | Stop writing `paid_amount` on the Supplier Payment **read** `queryFn`; move sync to an explicit reconcile action or voucher trigger |
| 3 | **Code fix** | CN→bill should mirror customer: prefer a bill-level adjust column or voucher-linked settlement, **or** ensure `credit_status='adjusted'` + CAB always set so snapshot netting cannot diverge from pool |
| 4 | **Code fix** | Always set `credit_available_balance` on return create (`net_amount`) and on AO/refund paths |
| 5 | **Data repair** | After (2)–(4), report `paid_amount` vs payment vouchers vs CN-adjusted amounts per bill; repair only with an audited script (not in this phase) |
| 6 | **Design / SQL** | Extend `_get_supplier_party_balances_rows` or add `get_supplier_account_state` returning four numbers; payment UI consumes that only |

---

## Could a shop have overpaid or underpaid?

**Yes.**

- Trusting the **header credit (−₹2.76L)** while **₹1.26L** still shows on bills → **underpayment** risk (delay paying a real payable).
- Trusting the **bill list** while the party is truly over-credited → **overpayment** risk.
- Read-path `paid_amount` sync can change what “unpaid” means when the screen is opened, amplifying confusion.

Until facets are split, treat contradictory header vs list as a **do-not-pay-from-header** rule.

---

## Access / probe notes (for auditors)

- Checkout project: `lkbbrqcsbhqjvsxiorvp`.
- Anon/publishable can execute `get_supplier_party_balances` when `auth.uid()` is null (auth gate skipped) — returns real org rows for the given UUID.
- Stated org UUID did **not** contain the stated supplier in that RPC result set (15 other suppliers). Reconfirm IDs in the SQL editor before repair work.
- Temporary probe scripts under `scripts/_tmp_supplier_recon_*` were used for RPC probes and should be deleted; they performed no writes.

---

## Stop

Phase 0 deliverable complete. No code or schema changes proposed beyond this document.
