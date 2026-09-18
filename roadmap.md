# Roadmap — duplicate-receipt work

Done (read-only):
- [x] S1: MASEERA ₹19,100 explained — memo-receipt counting artefact, not new dup, not a Phase 1 regression.
- [x] S1b: Re-sized population — genuine ~90 bills / ₹2,95,225; 121 bills / ₹6,32,552 are memo artefacts.
- [x] S2: Guard exists in all 6 receipt save paths; leak is TOCTOU + no DB key + selection-scoped cap.
- [x] S3: Printed-balance fix proposed (per-invoice credit cap).

Awaiting user decision (nothing implemented):
- [ ] Build receipt idempotency key (DB partial unique index / client_request_id).
- [ ] Server-side receipt balance re-check.
- [ ] Ship per-invoice credit cap in getCustomerAccountState + validate test/money fixtures.
- [ ] HELD: repair of the historical over-credited bills.
- [ ] HELD: 9-way convergence comparison (original audit steps 3-7).

Report: docs/duplicate-receipt-steps-1-3-2026-09-19.md
