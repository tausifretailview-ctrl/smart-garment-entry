-- Parallel smoke test for generate_voucher_number (run AFTER
-- 20261109120000_voucher_number_race_safe.sql is applied).
--
-- Open N psql sessions (or use pgbench) and run the SELECT below at the same
-- time. Collect results — all voucher numbers must be distinct.
--
-- Example with two terminals:
--   psql "$DATABASE_URL" -c "SELECT generate_voucher_number('receipt', CURRENT_DATE);"
--
-- Or pgbench (2 clients, 1 transaction each, same second):
--   pgbench -c 2 -t 1 -f scripts/concurrent-voucher-number-smoke.pgbench "$DATABASE_URL"

SELECT generate_voucher_number('receipt', CURRENT_DATE) AS voucher_number;
