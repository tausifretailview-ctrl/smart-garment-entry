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
| **Tanvi Taufu** | ₹2,950 Dr | Return pool aligned ✓ (R3 Aug 22) | Phase1 §1C, §1F |

### P1 — CN / return pool (31 customers flagged CN_DOUBLE)

| Customer | Party | Notes | Script |
|----------|-------|-------|--------|
| **FAIZA SALMAN MERCHANT** | — | SR/35 CAB drift | `ella-noor-p1-cn-repair.sql` §3a |
| **Parina Bhujwala** | — | SR/64 pending vs INV/1245 | `ella-noor-p1-cn-repair.sql` §3b |
| Saba Ali | ₹90,843 Dr | ₹43,933 recon gap | `ella-noor-p1-cn-breakdown.sql` |
| Siya Kapoor | ₹62,250 Dr | CN + advance ₹21,700 | `ella-noor-p1-cn-breakdown.sql` |
| KHADIJA SHEIKH | ₹8,800 Cr | CN repair batch customer | §1C export |
| MAHENOOR KAS | ₹1,000 Cr | Partial SRA after bulk repair | review only |
| SHEHNAZ HALAI | ₹51,010 Dr | Advance ₹24,850 + recon gap | §1D / §1E |

Full CN queue: `scripts/audit-cn-double-apply.sql` Block A2 (org filter) or `ella-noor-p1-cn-repair.sql` §0.

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
| **Sharmin Mewara** | R3 Aug 22 — return pool CAB zeroed → party **₹0 Settled** (was −₹11,500 Cr) |
| **Tanvi Taufu** | R3 Aug 22 — CAB hygiene on SR/47, SR/49; party **₹2,950 Dr** unchanged |
| **SHUMAMA BAIRELI** | R2 Aug 22 — owner repair complete; party **₹1,58,700 Dr** verified (`reconcile_customer_balance` export 2026-08-22) |
| **Faiza Adil** | R5 Aug 22 — INV/26-27/2423 paid drift fixed (`paid_amount` aligned; SRA ₹2,200 retained, status completed) |

---

## Repair batches (Phase 1 → 2)

| Batch | Scope | Action |
|-------|-------|--------|
| **R5** | 11 paid drift invoices | **Done Aug 22** — all 11 resynced (incl. Faiza Adil INV/26-27/2423) |
| **R2** | CN double-apply (8 + queue) | **Shumama P0 done Aug 22** — remaining queue in `repair-cn-double-apply-checklist.md` |
| **R3** | Return pool stale | **Sharmin + Tanvi done Aug 22** |
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

## Next step (Aug 22 — updated after owner repairs)

| Order | Script | Status |
|-------|--------|--------|
| **1** | `ella-noor-p0-component-breakdown.sql` | ✓ Exported |
| **2** | `ella-noor-phase1-classify-customers.sql` **§1F-batch** | Pending — Sumaiya breakdown |
| **3–4** | `ella-noor-r5-paid-drift-resync.sql` | ✓ **Done** (11/11 incl. Faiza) |
| **5** | `ella-noor-sharmin-mewara-balance-diagnostic.sql` | ✓ **Done** (R3) |
| **6** | `repair-cn-double-apply-checklist.md` Shumama P0 | ✓ **Done** — party ₹1,58,700 Dr confirmed |

**Remaining P0:** Sumaiya Chhapra Bhabhi (₹4,73,730 Dr — review only unless shop disputes).

**P1 CN (next owner run):**

| Order | Script | Action |
|-------|--------|--------|
| **7** | `ella-noor-p1-cn-breakdown.sql` | Export P1 component breakdown (Faiza Salman, Parina, Saba, Siya) |
| **8** | `ella-noor-p1-cn-repair.sql` **§0–§2** | Dry-run FAIZA SALMAN + Parina |
| **9** | `ella-noor-p1-cn-repair.sql` **§3a** | FAIZA SALMAN CAB sync (owner: ₹200 tail vs fully adjusted) |
| **10** | `ella-noor-p1-cn-repair.sql` **§3b** | Parina SR/64 consume (owner: return ₹3,350 vs ₹6,350 on invoice) |
| **11** | `ella-noor-p1-cn-repair.sql` **§5** | Verify party balances + re-run A2 |

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
| SHUMAMA BAIRELI | ₹1,58,700 Dr | ₹0 | **R2 ✓ done Aug 22** |
| Saba Ali | ₹90,843 Dr | ₹29,000 (1 pending SR) | **R2/R3** |
| Siya Kapoor | ₹62,250 Dr | ₹9,700 | **R2** + advance ₹21,700 |
| Sharmin Mewara | ₹11,500 Cr | ₹13,450 | **R3 ✓ done Aug 22** |
| Hanif bhai | ₹3,050 Cr | ₹3,050 | Done ✓ (§1C flag is stale) |
| Anusha Pathan | Settled | — | **R4** if refund not reversed |
| Tanvi Taufu | ₹2,950 Dr | — | **R3 ✓ done Aug 22** |

---

## Success gate (end of Phase 1)

- [x] P0 customers (3) have component breakdown reviewed  
- [x] Paid drift list (11) reviewed for R5 resync — **all repaired Aug 22**  
- [x] CN queue (§1C) exported and mapped to repair checklist — Shumama P0 done  
- [ ] Advance over-refund (§1E) count documented  
- [ ] Shop confirms top 10 Dr + top 10 Cr customer balances  
- [ ] Sumaiya Chhapra Bhabhi — owner review (party likely correct; ₹2,06,350 = payments not on invoices)
