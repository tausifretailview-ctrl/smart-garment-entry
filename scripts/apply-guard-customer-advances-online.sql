-- Apply advance pool guardrails without 40P01 deadlock on production.
-- Run each section separately in the SQL editor (Run selection), wait for success, then next.
-- If a section fails with deadlock, wait 60s and retry that section only — do not run all at once.

-- ========== SECTION A — helpers (safe under load) ==========
-- Paste from 20260920200000: _customer_advance_pool_cap + _customer_advance_applied_from_vouchers

-- ========== SECTION B — customer_advances BEFORE trigger ==========
-- Paste: guard_customer_advances_used_amount + DROP/CREATE trg_guard_customer_advances_used_amount

-- ========== SECTION C — voucher guard body ==========
-- Paste: CREATE OR REPLACE guard_advance_over_application (full function + COMMENT)

-- ========== SECTION D — CHECK constraint (quiet window / after hours) ==========
-- Run entire file: 20260920210000_customer_advances_used_within_amount_check.sql

-- Verify helpers exist:
-- SELECT proname FROM pg_proc WHERE proname LIKE '_customer_advance%';
