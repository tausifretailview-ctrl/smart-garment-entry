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
- [ ] Deploy the Step 2 fix (built, not deployed — awaiting go-ahead).
- [ ] Verify in production for a period, then repair the 51 historically over-credited bills (₹2,98,467).
- [ ] Step 3 proper: per-invoice credit cap in `getCustomerAccountState` (printed balance).
- [ ] Re-check the 132 artefact-inflated UNDERSTATED_PAID findings; consider netting CN against `sale_return_adjust` in `detect_settlement_drift`.
- [ ] 9-way convergence comparison (held).
