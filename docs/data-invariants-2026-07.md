# Data invariants — Phase 1 design (2026-07)

**Status:** Phase 1 complete — **detection design only**. No jobs, no viewer, no repairs.  
**Scope:** Read-only. Nothing in this phase may modify data.  
**SQL pack:** [`docs/data-invariants-phase1-sql.sql`](./data-invariants-phase1-sql.sql)  
**Live DB from this checkout:** publishable/anon key only — **cannot** execute `pg_stat` / cross-org aggregates here. Violation tables below are structured for a privileged SQL-editor run; **known defect anchors** from prior investigations are cited separately and must not be confused with a fresh Phase 1 remeasure.

**Then stop.** Build (Phase 2) waits on explicit approval of this list.

---

## Why these checks exist

| Defect (human-found) | Unnoticed for | Expressible as |
|---|---|---|
| MRP-derived phantom discounts on ~4,200 bills / 16 orgs | ~8 months | Display/math identity on sale lines (proposed INV-06) |
| Supplier ledger vs bill subledger ~₹4 lakh (one supplier) | unknown | INV-05 |
| 125 purchase-return headers, zero lines, ₹25.6 lakh / 7 orgs | ongoing | INV-02c |
| Purchase bill stock never reversed (8 phantom units) | ~4 months | INV-03 / INV-04 |
| POS date filter bypassed on text search | unknown | **Code** bug — not a nightly *data* invariant |

Nightly detection would have surfaced each data defect within ~24h of first appearance.

---

## Severity ranking (approved)

**Rank live-growing defects above static large ones.** A defect still writing new bad rows compounds while you deliberate.

| Rank | ID | Name | Severity | Why |
|---:|---|---|---|---|
| 1 | **INV-02c/d** | Headerless returns (esp. purchase returns) | **Critical** | **Actively producing** new bad rows (e.g. 28 headers Sunday 06:46–08:31); money/credit without lines |
| 2 | **INV-05** | Supplier snapshot ≠ bill subledger | **Critical** | Paying against the wrong number; serious but may be static |
| 3 | **INV-04** | Orphan stock movements (net ≠ 0, parent gone) | **Critical** | Phantom on-hand; write-off turns phantoms into fake loss |
| 4 | **INV-03** | `stock_qty` vs **document-based** recompute (`get_stock_reconciliation`) | **High** | Silent wrong inventory; movement-sum rejected (see below) |
| 5 | **INV-01b** | Sale gross/discount/net identity (rich form) | **High** | Silent wrong bill / journal basis; bare INV-01 rejected |
| 6 | **INV-02a/b** | Headerless sales / purchase bills | **High** | Orphan money headers |
| 7 | **INV-06** *(proposed)* | Implicit MRP “discount” without cashier discount | **High** | Customer-facing false savings (known ~4.2k bills) |
| 8 | **INV-07** *(proposed)* | Customer outstanding facets diverge | **High** | Stuck invoices / wrong receivable |
| 9 | **INV-08** *(proposed)* | `paid_amount` vs qualifying receipts | **Med-High** | Status vs ledger drift |
| 10 | Hold/cancelled edge cases | Med | Cosmetic if net≈0 |
| 11 | **INV-09** | Advance applied ≤ invoice `net_amount` | **Critical** | Silent advance burn (Siya / INV/362 class; ₹50,250 / 4 invoices ELLA NOOR) |

### Approved design calls

1. **INV-01b over INV-01** — bare `gross − discount = net` false-positives on flat discount / S/R / round-off.
2. **INV-03 via document-based `get_stock_reconciliation`**, not movement-sum — VELVET proved movement-sum can match a corrupt ledger (`stock_qty` and Σ movements both include the phantom `+1`). Compare against source documents instead.
3. **POS date-filter bypass is code, not data** — invariants catch wrong *state*, not wrong *behaviour*.

---

## 1A — Five required invariants

### INV-01 — Sale totals reconcile

**Statement:** For every non-deleted `sales` row:  
`gross_amount − discount_amount ≈ net_amount` (tolerance **0.01**).

**SQL:** see pack § INV-01.

**Exceptions:** none for the literal identity. Rows with intentional `flat_discount_amount` / `sale_return_adjust` / `round_off` will **false-positive** under this literal form — that is why **INV-01b** is proposed as the operational check.

**Control:** Pick any recent POS bill where cashier discount is 0, no flat discount, no S/R adjust, no round-off → gap must be 0.  
**Known-good control candidate:** any `payment_status = 'completed'` sale with `flat_discount_amount = 0`, `sale_return_adjust = 0`, `ABS(round_off) < 0.01`, `other_charges = 0`.

**Live counts:** *run pack INV-01 — paste CSV.*  
Investigation note: literal INV-01 alone is insufficient for POS (see INV-01b).

---

### INV-01b — Sale totals reconcile (richer — **recommended ship form**)

**Statement:**  
`gross − discount − flat_discount + other_charges + round_off ≈ net_amount + sale_return_adjust` (±0.01).

Matches POS convention: `net_amount` is payable **after** S/R adjust; merchandise ≈ `net + sra` (`saleSettlement.ts`).

**SQL:** pack § INV-01b.

**Control:** same completed sale as INV-01; plus one sale with known S/R adjust that still balances.

---

### INV-02 — No headerless documents

**Statement:** Every non-deleted header in `sales`, `purchase_bills`, `purchase_returns`, `sale_returns` has ≥1 live (`deleted_at IS NULL`) line item.

**SQL:** pack § INV-02a–02d.

**Exceptions:**
- Optional: exclude `sales.payment_status = 'hold'` with `net_amount = 0` if product confirms empty holds are allowed (confirm before shipping).
- Soft-deleted headers are already excluded.

**Control:**
- **Positive (must fire):** investigation anchor — empty `purchase_returns` (reported **125 headers / ₹25.6 lakh / 7 orgs**). Phase 1 live run must reproduce that class.
- **Negative (must be quiet):** a freshly saved purchase return with lines in a demo org → 0 for that org on 02c.

**Live counts:** *run pack — expect 02c near the known 125 / 7-org shape if still unrepaired.*

| Sub-check | Prior known (investigation) | Phase 1 live |
|---|---|---|
| 02c | 125 / 7 orgs / ₹25.6L | see §1D |

---

### INV-09 — Advance applied must not exceed invoice `net_amount`

**Statement:** For every non-deleted sale, Σ live `voucher_entries` with `voucher_type = 'receipt'` and `payment_method = 'advance_adjustment'` must be ≤ `net_amount + 1`.

**Why paid_amount cannot detect this:** `paid_amount` is cash-like tender and is capped at `net_amount`, so double advance application is invisible on screens.

**SQL:** pack § INV-09.

**Control (ELLA NOOR `3fdca631-…`):**
- **Before repair:** exactly **4** invoices — INV/26-27/362, INV/26-27/152, INV/25-26/534, INV/26-27/1746 (Σ excess ≈ ₹50,250).
- **After repair:** **0** rows (org-scoped and global).

**Do not** conflate with INV/26-27/367 CN+advance settlement (`paid_amount` = cash-like only by design).

---
| 02c purchase_returns | ~125 headers, ~₹25.6L, 7 orgs | *pending SQL* |
| 02a/b/d | not quantified | *pending SQL* |

---

### INV-09 — Advance applied must not exceed invoice `net_amount`

**Statement:** For every non-deleted sale, Σ live `voucher_entries` with `voucher_type = 'receipt'` and `payment_method = 'advance_adjustment'` must be ≤ `net_amount + 1`.

**Why `paid_amount` cannot detect this:** `paid_amount` is cash-like tender and is capped at `net_amount`, so double advance application is invisible on screens (Siya / INV/26-27/362).

**SQL:** pack § INV-09.

**Control (ELLA NOOR `3fdca631-1e0c-4417-9704-421f5129ff67`):**
- **Before repair:** exactly **4** invoices — `INV/26-27/362`, `INV/26-27/152`, `INV/25-26/534`, `INV/26-27/1746` (Σ excess ≈ ₹50,250).
- **After repair:** **0** rows.

**Do not** conflate with INV/26-27/367 CN+advance settlement (`paid_amount` = cash-like only by design).

**Repair runbook:** [`docs/advance-over-application-repair-2026-07.md`](./advance-over-application-repair-2026-07.md).

---

### INV-03 — Stock matches its ledger

**Statement (as requested):** for every non-deleted `product_variants`:  
`stock_qty = Σ stock_movements.quantity` (non-deleted movements).

**Exceptions (mandatory):**
| Pattern | Rule |
|---|---|
| Service / combo | `products.product_type IN ('service','combo')` — **exclude** |
| Sentinel unlimited stock | `stock_qty >= 999999` (`SERVICE_VIRTUAL_STOCK_QTY`) — **exclude** |
| Soft-deleted variants/products | excluded via `deleted_at` |

**Formula warning (must not ship blindly):**  
`product_variants.stock_qty` is **not** maintained by a generic trigger on `stock_movements`. Writers pair `UPDATE stock_qty` with an audit `INSERT`. Canonical recompute in RPCs is:

```
opening_qty + purchases − sales − purchase_returns + sale_returns − pending_dc
```

(`docs/stock-movement-drift-2026-07.md`, `get_stock_reconciliation`).  
**Movement-sum alone will false-positive** where opening stock was set without movements, or movements are incomplete audit.  

**Phase 2 recommendation:** ship **document-based drift** (existing reconciliation RPC) as INV-03; keep movement-sum as INV-03-audit only if control-clean.

**Control:**
- **Negative:** org `a1bac661-…` variants whose purchase + purchase_delete net correctly and bills still exist → movement-sum should match after sentinel exclusion (validate sample).
- **Positive:** VELVET variant `697293ad-…` (barcode `150001717`) — stored 2 vs recomputed 1 (+1 phantom) — must appear under document-based check.

**Live counts:** *run pack INV-03 — if violation_count is huge cluster-wide, do not approve movement-sum form.*

---

### INV-04 — No orphaned movements

**Statement:** Every live `stock_movements` row with non-null `reference_id` either:

1. has a parent in `purchase_bills` / `sales` / `purchase_returns` / `sale_returns`, **or**
2. nets to **zero** with sibling movements on the same `(variant_id, reference_id)` (proper reverse: e.g. `purchase` + `purchase_delete`).

**SQL:** pack § INV-04 (net-by-ref, parent missing, `|net| > 0`).

**Exceptions:** `reference_id IS NULL` (manual / legacy) — out of scope for this check (separate optional check later).

**Control (hard requirement from brief):**  
Org `a1bac661-f294-4a95-a7a9-8c64e8864456` — 9,493 `purchase` matched by 9,493 `purchase_delete` — **orphan check must return 0 rows**. Pack includes an explicit control probe.

**Positive control:** B0326034 class — `purchase` movement whose bill is gone and no reverse → must fire (VELVET / `docs/stock-movement-drift-2026-07.md`).

**Live counts:** *run pack + control probe.*

---

### INV-05 — Supplier balance agrees with subledger

**Statement:** For each supplier, `|fetchSupplierBalanceSnapshot.balance − Σ bill netPayable after FIFO credit| ≤ 1` (rupee).

**App formulas:**
- Snapshot (`supplierBalanceUtils.ts` / `get_supplier_party_balances`):  
  `OB + purchases − paid − cnNet − unreflectedReturns − refunds` (can be **negative** = credit).
- Subledger (`supplierBillOutstanding.ts`):  
  `raw = max(0, net − max(paid, voucherPaid))`; FIFO allocate AO (+ unapplied CN) pool; `netPayable = max(0, raw − alloc)`.

**Architectural note:** header can go deep credit while bill list is floored ≥ 0 — **systemic divergence**, not only bad rows (`docs/supplier-balance-reconciliation-2026-07.md`). Nightly check should still flag `|divergence| > 1` so ops see growth; Phase 2 must not “repair” by rewriting balances.

**SQL:** pack § INV-05 (per-org template; AO-pool FIFO proxy). Full parity needs CN unapplied pool — prefer a read-only SECURITY DEFINER RPC that reuses `_get_supplier_party_balances_rows` + TS allocator ported to SQL.

**Control:**
- **Positive:** SARASWATI `27a7a71f-…` / org `5e769632-…` — known ~₹4 lakh class divergence.
- **Negative:** supplier with only open bills, no returns, no OB, payments only via vouchers matching `paid_amount` → divergence ≈ 0.

**Live counts:** *run per-org template for `5e769632` first, then sample 5 quiet orgs.*

---

## 1B — Additional invariants proposed from code

Prioritised for **silent wrong numbers** (not crashes):

| ID | Invariant | Source modules | Catches |
|---|---|---|---|
| **INV-06** | Sale/POS lines where `Σ(mrp−unit)×qty` ≫ cashier `discount` while UI shows “% off” | `POSSales` `sumLineDiscount` / MRP footer; `docs/mrp-flag-audit-2026-07.md` | Phantom savings (~4.2k bills class) |
| **INV-07** | `getCustomerAccountState` facets: `\|outstanding − (invoices − receipts − SRA − …)\| > 1` vs RPC `get_customer_true_outstanding` | `customerBalanceCore.ts`, `customerBalanceUtils.ts` | Receivable wrong on screen |
| **INV-08** | `sales.paid_amount` vs Σ qualifying receipts (`CUSTOMER_RECEIPT_REFERENCE_TYPE_VALUES`) beyond `SETTLEMENT_TOLERANCE` (code = **1.0**) | `saleSettlement.ts`, `paymentVoucherFilters.ts` | Stuck Not Paid / overpaid status |
| **INV-09** | `credit_status = 'adjusted'` + `credit_available_balance IS NULL` on returns with linked bill (CN double-count risk) | `supplierBalanceUtils.ts` CAB NULL path | Supplier over-credit |
| **INV-10** | Return header `net_amount > 0` but zero lines *(subset of INV-02 already)* — keep as severity tag | returns tables | Same as 02c/d |
| **INV-11** | `purchase_bills.paid_amount` ≫ Σ bill-linked payment vouchers (voucher-less paid drift) | supplier payment path | Subledger vs cash book |
| **INV-12** | Service variants with `stock_qty NOT IN (0, 999999)` and movement history | `productStockDisplay.ts` | Sentinel pollution |

**Out of nightly data scope:** POS date-filter bypass on text search — **code invariant / regression test**, not a SQL check on stored rows.

---

## 1C — Known-good exceptions (summary)

| Exception | Precise pattern | Applies to |
|---|---|---|
| Service / combo | `products.product_type IN ('service','combo')` | INV-03, valuation |
| Sentinel stock | `product_variants.stock_qty >= 999999` (constant `999999`) | INV-03 |
| Properly reversed deletes | Net qty on `(variant_id, reference_id)` = 0 even if parent hard-deleted | INV-04 |
| Soft-deleted rows | `deleted_at IS NOT NULL` | all checks |
| Supplier credit (negative snapshot) | Snapshot **may** be &lt; 0; compare with signed vs floored subledger carefully | INV-05 |

**Control policy:** every shipping check must have a documented org/supplier/variant that returns **zero** violations under the exceptions above. A check that fires on correct data will train people to ignore the report.

---

## 1D — Live violation counts

### Status

| Check | Control result | Live count | Runtime (SQL editor) | Notes |
|---|---|---|---|---|
| **INV-02c** purchase_returns | (+) reproduced | **125 headers / 7 orgs / ₹25,55,584** | *from 2026-07-28 18:46 export* | Still live; see table below |
| INV-02d sale_returns | pending | pending | | |
| INV-02a sales | pending | pending | | |
| INV-02b purchase_bills | pending | pending | | |
| INV-04 orphans | (−) `a1bac661` must be 0 | pending | | Do not record if control fails |
| INV-03 document drift | (+) VELVET `697293ad` | pending | | Not movement-sum |
| INV-01b sale identity | (−) simple completed bills | pending | | |
| INV-05 supplier | (+) SARASWATI / `5e769632` | pending | | |

### INV-02c — live snapshot (2026-07-28 ~18:46 IST, privileged SQL)

| organization_id | headers_without_items | orphan_value (₹) |
|---|---:|---:|
| `ad86a484-8557-4186-9cba-e1805faaeb9b` | 50 | 7,79,342.00 |
| `93606968-c342-4b72-a1ce-2d75d678567f` | 31 | 11,61,466.00 |
| `c2bd3701-8f43-467e-a9c5-e21a608c5f3b` | 28 | 5,44,327.10 |
| `4bc73037-e877-4123-9261-eb6e3876698c` | 10 | 34,290.53 |
| `abcc0ee8-928b-4a1a-8a53-eb7c997391c8` | 4 | 30,989.58 |
| `5e769632-a203-4a47-9d52-8c2bbdd1b23b` | 1 | 118.00 |
| `e8fbf0d8-182c-4364-8570-96c756b72db8` | 1 | 7,050.75 |
| **Total** | **125** | **~25.55 lakh** |

Org `c2bd3701-…` shows the Sunday-morning burst (PR/26-27/41…69 class, 06:46–08:31) — **live-growing**.

### Blocker for remaining counts

Supabase dashboard session redirected to **sign-in** mid-run. Remaining checks need a signed-in SQL editor session (or CSV exports of `docs/data-invariants-control-first.sql` blocks A→J).

**Run order:** control A (INV-04) → control B (INV-03) → INV-02* → INV-01b → INV-04 counts → INV-03 rollup → INV-05.

---

## Phase 2 sketch (not built — for approval context only)

| Choice | Recommendation | Why |
|---|---|---|
| Schedule | **pg_cron** calling one SECURITY DEFINER `run_data_invariant_checks()` | Same DB, no Edge cold-start; off-peak `0 20 * * *` UTC (~01:30 IST) |
| Shape | One function → rows `(check_name, organization_id, violation_count, sample_ids uuid[], severity, ran_at)` | Trendable |
| Storage | `data_invariant_runs` (+ optional `data_invariant_violations` samples) | Day-over-day growth = live bug |
| Viewer | Settings → Admin only | No Slack/email in v1 |
| Perf | **Iterate orgs**; no single unbounded scan; abort if wall &gt; ~2 min | Avoid new `pg_stat` hotspot |
| Repair | **Forbidden** | Detection only |

---

## Explicit non-goals (Phase 1 + Phase 2)

- No automatic repair (ever).  
- No writes to business tables.  
- No RLS / payment / settlement / stock writer changes.  
- No alerting integrations in v1.

---

## Approval checklist (for you)

- [x] Approve INV-01b over INV-01  
- [x] Approve INV-03 **document-based** `get_stock_reconciliation` (not movement-sum)  
- [x] POS date filter = code boundary (not data invariant)  
- [x] Severity: INV-02c/d ahead of INV-05 (live-growing first)  
- [ ] Confirm empty `hold` sales are violations or exceptions  
- [ ] Approve INV-05 proxy SQL vs “RPC must mirror TS exactly” before build  
- [ ] Approve proposed INV-06…12 shortlist for v1 vs defer  
- [ ] Live counts + runtimes recorded below  

**Phase 1 → fill live counts, then Phase 2 on approval of numbers.**
