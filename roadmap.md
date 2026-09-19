# Roadmap — duplicate-receipt hardening

## Done
- [x] Steps 1–3 read-only report (`docs/duplicate-receipt-steps-1-3-2026-09-19.md`).
- [x] Step 2 safety check: signature-based uniqueness WOULD reject legitimate patterns; per-submit key used instead.
- [x] Step 2.1 idempotency key — `voucher_entries.client_request_id` + partial unique index, wired into all six receipt writers.
- [x] Step 2.2 server-side atomic cap — `trg_enforce_receipt_within_invoice_cap` (FOR UPDATE on the sale).
- [x] Step 2.3 client hardening — plain rejection messages; submit buttons already disable while saving.
- [x] Validation: rolled-back live rehearsal (4/4), money suite 398 passed, typecheck + build clean.
- [x] Step 3 pre-audit: CN+SR-adjust artefact inflates 132/267 UNDERSTATED_PAID warnings; the 290 OVERSTATED_PAID criticals are clean.

## Open (blocked on user decision)
- [x] Deploy the Step 2 fix — LIVE in production since 2026-09-18 20:10 UTC. Do not roll it back.
- [ ] Repair the 51 historically over-credited bills (₹2,99,467) — **WAIT**. Full sibling scan pasted 19 Sep 21:09 IST (`docs/ssot-51-full-sibling-scan-2026-09-19.md`): receipt-bearing population is 91 bills / ₹2,98,108 (₹ matches, count does not — materialise the 51 by `sale_number` first). Customer-level split: **A NEEDS_BUCKET_G 14 customers / 25 bills** (SHREEVASTAV, VIMLA, DIYA, ANANYA + 10; ₹28,116 at-sale cash SNAP still drops after a perfect repair) — blocked on the SNAP `paid_at_sale_drift` fix. **B REPAIR_SUFFICIENT_SNAP 49 customers / 57 bills** after 5 NET_DUE_ZERO refund rows and DOLLY are excluded; customer-atomic (HEENA = all of 853/1488/1594/1714). SANTOSH separate (1131-1). 365 tender-only over-credit rows (no receipt) are a different population.
- [ ] Step 3 proper: per-invoice credit cap in `getCustomerAccountState` (printed balance).
- [ ] Re-check the 132 artefact-inflated UNDERSTATED_PAID findings; consider netting CN against `sale_return_adjust` in `detect_settlement_drift`.
- [ ] 9-way convergence comparison (held). Formula audit: **none** of C-PARTY/C-REC/C-STMT/C-AUDIT/C-OB-SALES is a confirmed customer-level source.
