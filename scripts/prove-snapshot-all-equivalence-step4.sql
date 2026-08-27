-- =============================================================================
-- STEP 4 — DO NOT RUN THIS FILE IN LOVABLE SQL EDITOR
-- =============================================================================
-- get_customer_financial_snapshot → assert_org_member → 42501 (always fails here)
--
-- >>> USE INSTEAD: prove-snapshot-all-equivalence-step4-sql-editor-safe.sql <<<
--
-- Or Node/JWT: node scripts/prove-snapshot-all-equivalence.mjs
-- =============================================================================

SELECT
  'STOP: use prove-snapshot-all-equivalence-step4-sql-editor-safe.sql' AS instruction,
  'get_customer_financial_snapshot is blocked (42501 assert_org_member)' AS reason;
