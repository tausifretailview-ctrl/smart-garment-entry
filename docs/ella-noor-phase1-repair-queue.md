# ELLA NOOR — Phase 1 repair queue

**Org:** `3fdca631-1e0c-4417-9704-421f5129ff67`  
**Source:** Phase 0 exports (Aug 2026) — 783 customers, 144 with recon drift > ₹1  
**Canonical balance:** `get_customer_party_balances.signed_balance` (= `_get_customer_party_balances_rows`)

## Org snapshot (Phase 0)

| Metric | Value |
|--------|-------|
| Total Dr | ₹32,07,872 |
| Total Cr | ₹18,32,454 |
| Net receivable | ₹13,75,418 |
| Unused advance pool | ₹18,11,617 |
| Paid drift invoices | 11 (see R5) |

---

## Priority tiers

### P0 — repair before shop sign-off

| Customer | Party balance | Issue | Script / doc |
|----------|---------------|-------|--------------|
| **Sumaiya Chhapra Bhabhi** | ₹4,73,730 Dr | ₹2,06,350 recon gap; dashboard vs party | Phase1 §1F |
| **Tanvi Taufu** | ₹2,950 Dr | Return pool ₹70k+ not aligned | Phase1 §1C, §1F |
| **SHUMAMA BAIRELI** | ₹1,58,700 Dr | CN double-apply + pending SR ₹33,450 | `repair-cn-double-apply-checklist.md` P0 |

### P1 — CN / return pool (31 customers flagged CN_DOUBLE)

| Customer | Party | Notes |
|----------|-------|-------|
| Saba Ali | ₹90,843 Dr | ₹43,933 recon gap |
| Siya Kapoor | ₹62,250 Dr | CN + advance ₹21,700 |
| KHADIJA SHEIKH | ₹8,800 Cr | CN repair batch customer |
| MAHENOOR KAS | ₹1,000 Cr | Partial SRA after bulk repair |
| Sharmin Mewara | ₹11,500 Cr | Return pool stale — `ella-noor-sharmin-mewara-balance-diagnostic.sql` |
| SHEHNAZ HALAI | ₹51,010 Dr | Advance ₹24,850 + recon gap |

Full CN queue: run `scripts/audit-cn-double-apply.sql` Block A2 with org filter.

### P2 — advance-heavy Cr balances (25 customers)

| Customer | Party | Advance pool |
|----------|-------|--------------|
| NASIM VAPI | ₹24,850 Cr | ₹44,800 |
| ASMA AKIL MEMON | ₹24,950 Cr | ₹24,950 |
| Saniya Mahaldar | ₹40,000 Cr | ₹40,000 |
| Fariba Qureshi | ₹13,400 Cr | ₹13,400 |
| Sana Nasir | ₹20,000 Cr | ₹20,000 |

Run Phase1 §1D and §1E for advance refund scan.

### P3 — micro drift (< ₹1,000) or party = recon

643 customers — **no repair** unless shop disputes. Party RPC matches manual recon.

### Done ✓

| Customer | Status |
|----------|--------|
| Hanif bhai | ₹3,050 Cr — fixed (migration + adjustment) |
| ALOK KUMAR (TAZIM) | Settled ₹0 |
| Samiya Nursumar Bhabhi | ₹4,55,820 Dr — party = recon (drift 0) |

---

## Repair batches (Phase 1 → 2)

| Batch | Scope | Action |
|-------|-------|--------|
| **R5** | 11 paid drift invoices | Resync via `compute_sale_settlement` — Phase1 §1B list |
| **R2** | CN double-apply (8 + queue) | Owner decision per `repair-cn-double-apply-checklist.md` |
| **R3** | Return pool stale | Update `credit_available_balance` + `credit_status` |
| **R4** | Advance over-refund | Phase1 §1E rows — reverse/tag ARF vouchers |
| **R6** | Micro-drift | `customer_balance_adjustments` with tag |

**Rules:** dry-run SELECT first, 5-row hand-check, repair tag in notes, run invariant digest after.

---

## Phase 1 SQL — run order

1. `ella-noor-phase1-classify-customers.sql` **§1A** — export non-settled list  
2. **§1B** — paid drift invoice batch  
3. **§1C** — CN double-apply queue  
4. **§1D + §1E** — advance outliers  
5. **§1G** — P0/P1 spot list  
6. **§1F** — per-customer breakdown (change name pattern each time)  
7. **§1F-batch** — same breakdown for multiple customers (edit `name_patterns` array)

**SQL editor gotcha:** Never paste bare `AND c.customer_name ILIKE ...` lines — they are not valid SQL. Run the full **§1F** or **§1F-batch** block.

---

## Next step (Aug 22 — owner run in Supabase)

| Order | Script | Action |
|-------|--------|--------|
| **1** | `ella-noor-p0-component-breakdown.sql` | Export P0 breakdown (Sumaiya, Tanvi, Shumama) |
| **2** | `ella-noor-phase1-classify-customers.sql` **§1F-batch** | Export P1 breakdown (Sharmin, Saba, Siya, Anusha, Hanif) |
| **3** | `ella-noor-r5-paid-drift-resync.sql` **§1** | Dry-run 11 paid drift invoices |
| **4** | `ella-noor-r5-paid-drift-resync.sql` **§2** | Uncomment + COMMIT after hand-check 5 rows |
| **5** | `ella-noor-sharmin-mewara-balance-diagnostic.sql` **§4–5** | Confirm stale return pool before R3 |
| **6** | `repair-cn-double-apply-checklist.md` | Owner sign-off for Shumama R2 |

**R5 is safe to run without owner decision** — it only aligns `paid_amount` to `compute_sale_settlement`.  
**R2/R3 need owner sign-off** before mutating return pools or CN vouchers.

---

## Phase 1 export analysis (Aug 22 exports)

| Export | Section | Rows | Key finding |
|--------|---------|------|-------------|
| 17-12-21 | §1A party list | 774 | 783 customers; top Dr: Sumaiya ₹4.73L, Shumama ₹1.59L |
| 17-12-48 | §1B paid drift | 11 | KHADIJA SHEIKH INV/25-26/585 worst (−₹21k paid) |
| 17-13-36 | §1C CN double | 15 | Hanif still flagged (CN ₹3,200 vs SRA ₹0 — post-repair residual) |
| 17-14-29 | §1D advance-heavy | 290 | NASIM VAPI ₹44.8k unused advance; Sana Nasir ₹11L used |
| 17-15-47 | §1E over-refund | 53 | Anusha Pathan ₹5,450 over-refund on ADV/25-26/849 |
| 17-16-10 | §1G P0/P1 spot | 13 | Sharmin return pool ₹13,450 vs party −₹11,500 |
| 17-16-39 | §1F Shumama | 9 | CN + SRA both −₹61,900; party ₹1,58,700 Dr confirmed |

### P0/P1 spot-check (§1G)

| Customer | Party | Return pool | Repair batch |
|----------|-------|-------------|--------------|
| Sumaiya Chhapra Bhabhi | ₹4,73,730 Dr | — | §1F breakdown needed |
| SHUMAMA BAIRELI | ₹1,58,700 Dr | ₹0 | **R2** CN double-apply |
| Saba Ali | ₹90,843 Dr | ₹29,000 (1 pending SR) | **R2/R3** |
| Siya Kapoor | ₹62,250 Dr | ₹9,700 | **R2** + advance ₹21,700 |
| Sharmin Mewara | ₹11,500 Cr | ₹13,450 | **R3** stale CAB |
| Hanif bhai | ₹3,050 Cr | ₹3,050 | Done ✓ (§1C flag is stale) |
| Anusha Pathan | Settled | — | **R4** if refund not reversed |
| Tanvi Taufu | ₹2,950 Dr | — | §1F needed |

---

## Success gate (end of Phase 1)

- [ ] P0 customers (3) have component breakdown reviewed  
- [ ] Paid drift list (11) reviewed for R5 resync  
- [ ] CN queue (§1C) exported and mapped to repair checklist  
- [ ] Advance over-refund (§1E) count documented  
- [ ] Shop confirms top 10 Dr + top 10 Cr customer balances
