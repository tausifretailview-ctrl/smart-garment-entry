# CN double-apply repair checklist (ELLA NOOR)

**Org:** `3fdca631-1e0c-4417-9704-421f5129ff67`  
**Source:** Block A2 widened (`2026-06-04`) + A3 + A4 voucher export  
**Rule:** Do **not** auto-fix balances without owner sign-off and an audit log. Deploy FIFO CN path on Sales Invoice before bulk data edits.

---

## Summary (A2)

| Priority | Customer | CN vouchers | Pending/partial CAB | Ceiling |
|----------|----------|-------------|---------------------|---------|
| P0 | Shumama Baireli | ₹40,150 | ₹33,450 | ₹73,600 |
| P1 | FAIZA SALMAN MERCHANT | ₹6,000 | ₹6,200 | ₹12,200 |
| P1 | Parina Bhujwala | ₹6,350 | ₹3,350 | ₹9,700 |
| P2 | Faiza Sheikh | ₹13,100 | ₹400 | ₹13,500 |
| P2 | Atiya Merchant | ₹6,950 | ₹1,850 | ₹8,800 |
| P3 | MONIKA VERMA | ₹5,500 | ₹200 | ₹5,700 |
| P3 | AAISHA | ₹4,400 | ₹150 | ₹4,550 |
| P3 | Shareen Natalia | ₹3,000 | ₹200 | ₹3,200 |

---

## P0 — Shumama Baireli

**Customer id:** `224e20b5-12a7-4ad0-b7e3-c8d593d7d8f9`  
**Canonical balance (as-is DB):** ~**₹17,400 Cr** (`get_customer_true_outstanding` ≈ -17400)

### Vouchers (dashboard path, mis-tagged `CustomerReceipt`)

| Voucher | Invoice | Sale id | Amount | `reference_type` |
|---------|---------|---------|--------|------------------|
| RCP/26-27/928 | INV/26-27/167 | `87b50640-68b4-4250-b4af-6f4021e9bf74` | ₹2,150 | CustomerReceipt → fix **sale** |
| RCP/26-27/929 | INV/26-27/803 | `52cb84f1-6284-4dcc-b084-d116b2d7f220` | ₹38,000 | CustomerReceipt → fix **sale** |

### Returns

| Return | Status | CAB | Linked sale | Notes |
|--------|--------|-----|-------------|-------|
| SR/26-27/33 | adjusted | 0 | INV/158 (`87b50640-…`) | CN/16 fully used; **not** 803 pool |
| SR/26-27/36 | **pending** | ₹11,100 | — | Should fund 803, not sit open |
| SR/26-27/37 | **pending** | ₹11,400 | — | Same |
| SR/26-27/41 | **pending** | ₹10,950 | — | Same; Σ pending **₹33,450** |

### Invoices

| Invoice | `sale_return_adjust` | Issue |
|---------|----------------------|--------|
| INV/26-27/803 | ₹38,000 | Matches RCP/929; returns **not** consumed |
| INV/26-27/167 | ₹2,150 | Matches RCP/928; SR/33 on **158** — confirm 167 only needs ₹2,150 |

### Owner decision (required)

- Goods returned on **803**: **₹33,450** (three SRs) or **₹38,000**?
- Gap **₹4,550** = reduce voucher/SRA **or** enter missing return.

### Mechanical repair (after decision)

1. **Consume** SR/36, SR/37, SR/41 against sale `52cb84f1-…` (803):  
   `credit_status = adjusted`, `credit_available_balance = 0`, `linked_sale_id = 52cb84f1-…`, sync `credit_notes.used_amount` if present.
2. If only ₹33,450 valid: reduce INV/803 `sale_return_adjust` and RCP/929 by **₹4,550** (or void/replace voucher).
3. Fix vouchers: `reference_type = 'sale'` for RCP/928, RCP/929.
4. Re-run `scripts/verify-shumama-balance.sql` Block 1 — expect balance to move **less Cr** (roughly +₹33,450 Dr component if only step 1).

---

## P1 — Parina Bhujwala

### A2

- CN applied: **₹6,350** | Pending CAB: **₹3,350** | Ceiling: **₹9,700**

### A3 / vouchers

| Item | Detail |
|------|--------|
| Invoice | INV/26-27/1245 — `sale_return_adjust` **₹6,350**, completed |
| Voucher | RCP/26-27/1348 (2026-06-02) — ₹6,350 — may be `reference_type = sale` (not in A4) |
| Return | **SR/26-27/64** — **pending**, CAB **₹3,350**, net **₹3,350**, **not linked** |

### Gap

- Voucher **₹6,350** vs return net **₹3,350** → **₹3,000** excess on invoice side (same pattern as Shumama, smaller).

### Actions

1. Owner: was return **₹3,350** or **₹6,350** on 1245?
2. Link/consume **SR/64** to INV/1245 (CAB → 0, adjusted).
3. If ₹3,350 only: reduce SRA + voucher by **₹3,000**.

---

## P1 — FAIZA SALMAN MERCHANT

### A2

- CN applied: **₹6,000** | Pending CAB: **₹6,200** | Ceiling: **₹12,200**

### A3 / vouchers

| Item | Detail |
|------|--------|
| Invoice | INV/26-27/729 — SRA **₹6,000** |
| Voucher | RCP/26-27/815 — ₹6,000 |
| Return | **SR/26-27/35** — **partially_adjusted**, **linked** to 729 (`fff42ec3-…`), CAB **₹6,200** = full **net** |

### Issue

- Return shows **linked** to same invoice as voucher but CAB still equals **full net** (headroom not decremented). Likely **CAB backfill / partial apply** drift, not a second invoice.

### Actions

1. Set **SR/35** `credit_available_balance = 0` (or `net - 6000` if partial intent), `credit_status = adjusted`.
2. Confirm **credit_notes** row for SR/35: `used_amount` = `credit_amount`.
3. Re-check A2 — should drop off list or ceiling → ~₹200 tail only.

---

## P2 — Faiza Sheikh

### A2

- CN applied: **₹13,100** | Pending CAB: **₹400** | Ceiling: **₹13,500**

### Vouchers

| Voucher | Invoice | Amount |
|---------|---------|--------|
| RCP/26-27/795 | INV/26-27/473 | ₹4,600 |
| RCP/26-27/1122 | INV/26-27/778 | ₹8,500 |

### A3

| Return | Status | CAB | Invoices in A3 join |
|--------|--------|-----|---------------------|
| SR/25-26/67 | partially_adjusted | **₹400** | 473 (SRA 4600), 778 (SRA 8500) |

### Actions

1. **Likely OK** — ₹400 tail on SR/67; confirm with shop.
2. If 778/473 fully settled: zero **₹400** CAB, mark **adjusted**.
3. Fix **CustomerReceipt** → **sale** on RCP/795, RCP/1122 (tag hygiene).

---

## P2 — Atiya Merchant

### A2

- CN applied: **₹6,950** | Pending CAB: **₹1,850** | Ceiling: **₹8,800**

### Vouchers / A3

| Item | Detail |
|------|--------|
| RCP/26-27/989 | INV/26-27/824 — ₹6,950 |
| SR/26-27/29 | partially_adjusted, **linked** 824, CAB **₹1,850**, net **₹8,800** |

### Actions

1. Applied **₹6,950** of **₹8,800** return — **₹1,850** remainder is plausible **partial**.
2. Set CAB to **1850** explicitly (if correct) or **0** if owner says fully applied (then fix SRA/voucher).
3. Tag fix on RCP/989.

---

## P3 — MONIKA VERMA / AAISHA / Shareen Natalia

Small tails (**₹150–₹200** CAB); linked returns on same invoice as voucher.

| Customer | Invoice | Voucher | SRA | SR | CAB left |
|----------|---------|---------|-----|-----|----------|
| MONIKA | INV/679 | RCP/861 ₹5,500 | 5500 | SR/31 linked | ₹200 |
| AAISHA | INV/889 | RCP/986 ₹4,400 | 4400 | SR/49 linked | ₹150 |
| Shareen | INV/804 | RCP/924 ₹3,000 | 3000 | SR/44 linked | ₹200 |

### Actions

1. Confirm partial intent with owner (usually **yes**).
2. If fully applied: `credit_available_balance = 0`, `credit_status = adjusted`.
3. Bulk **reference_type** fix on listed RCPs.

---

## Org-wide tag hygiene (after review)

```sql
-- PREVIEW
SELECT voucher_number, reference_type, reference_id
FROM voucher_entries
WHERE organization_id = '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
  AND deleted_at IS NULL
  AND voucher_type = 'receipt'
  AND LOWER(COALESCE(payment_method, '')) = 'credit_note_adjustment'
  AND reference_type = 'CustomerReceipt'
  AND EXISTS (SELECT 1 FROM sales s WHERE s.id = reference_id AND s.organization_id = organization_id);

-- APPLY (only after backup / audit log)
-- UPDATE voucher_entries ve
--    SET reference_type = 'sale'
--  WHERE ... same WHERE as preview ...
```

---

## Verification after each customer

```sql
-- Per customer (replace id)
SELECT public.get_customer_true_outstanding(
  '<customer_id>'::uuid,
  '3fdca631-1e0c-4417-9704-421f5129ff67'::uuid
);

-- Re-run A2 scoped to org (expect row to drop or ceiling to shrink)
-- scripts/audit-cn-double-apply.sql Block A2
```

---

## Code deploy (prevents recurrence)

- **Ship:** `applyCreditNoteFifoToSale` on Sales Invoice CN payment (`SalesInvoiceDashboard.tsx`).
- **Do not** hand-edit `supabase/migrations/*`; new timestamped migration if extending `trg_normalize_voucher_reference_type` to map `CustomerReceipt` + sale id → `sale`.
