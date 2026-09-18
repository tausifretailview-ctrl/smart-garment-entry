# Roadmap — customer balance drift audit (read-only measurement)

- [ ] S1: Name + individually hand-reconstruct all 13 duplicate-receipt rows (GURUKRUPA e8fbf0d8 ₹9,500/4 rows; VELVET dafc3d0c ₹70,842/15 rows). Include DOLLY JAIN, DIYA, ANANYA, and the VELVET POS/85 NULL-customer row.
- [ ] S2: Is C-JS (printed bill) structurally immune to duplicate receipts? Read receipt-crediting logic + test 2+ confirmed customers.
- [ ] S3: 9-way comparison on ELLA NOOR; explicit sample size, selection, share of receivable.
- [ ] S4: Classify drift a-f; hand-verify 3-5 of (f).
- [ ] S5: Migration-order recommendation.
- [ ] S6: Same sizing for KS FOOTWEAR and VELVET.
- [ ] Deliverable: docs/ report + chat summary.

No repairs, no data or RPC changes in this pass.
