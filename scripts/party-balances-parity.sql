-- Party balances v2 parity gate
--
-- Usage (Lovable SQL editor):
--   1. Apply migration 20260823140000_party_balances_rows_v2.sql first.
--   2. SET statement_timeout = '120s';
--   3. Replace :org_id with each required org UUID (or use \set in psql).
--   4. Both queries below must return zero rows / matching counts.
--
-- Required orgs (feature coverage, not size alone):
--   697c451a-f863-4fe4-82f3-31859a9e5251  largest (16,903 customers)
--   3fdca631-1e0c-4417-9704-421f5129ff67  ELLA NOOR (CN, advances, legacy vocabulary)
--   ceb7f3dd-3619-4718-a8c1-43a02252e5b9  mid-size control (2,301 customers)
--   0b3a8035-1bf6-40a0-b038-8f0406c93c18  1,271 customers
--   ad86a484-8557-4186-9cba-e1805faaeb9b  small org (660 customers)
--
-- Highest-risk silent failures:
--   - Balance moves by exactly advance_adjustment receipt total → amt_all/amt_excl_advance swapped
--   - Customer in one side only → INNER JOIN dropped sales that had no receipts (leg A parity)
--   - out_total_dr/out_total_cr/out_net_receivable shift → window aggregates over whole set

SET statement_timeout = '120s';

-- ---------------------------------------------------------------------------
-- A) Row-count parity (must match)
-- ---------------------------------------------------------------------------
-- Replace '<ORG_UUID>' before running:
/*
SELECT
  (SELECT count(*) FROM public._get_customer_party_balances_rows('<ORG_UUID>'::uuid))    AS old_rows,
  (SELECT count(*) FROM public._get_customer_party_balances_rows_v2('<ORG_UUID>'::uuid)) AS new_rows;
*/

-- ---------------------------------------------------------------------------
-- B) Full column diff (must return zero rows)
-- ---------------------------------------------------------------------------
-- Replace '<ORG_UUID>' before running:
/*
WITH a AS (
  SELECT * FROM public._get_customer_party_balances_rows('<ORG_UUID>'::uuid)
), b AS (
  SELECT * FROM public._get_customer_party_balances_rows_v2('<ORG_UUID>'::uuid)
)
SELECT
  COALESCE(a.out_customer_id, b.out_customer_id) AS customer_id,
  a.out_signed_balance      AS old_signed,  b.out_signed_balance      AS new_signed,
  a.out_advance_available   AS old_adv,     b.out_advance_available   AS new_adv,
  a.out_direction           AS old_dir,     b.out_direction           AS new_dir,
  a.out_net_position        AS old_net,     b.out_net_position        AS new_net,
  a.out_total_dr            AS old_total_dr, b.out_total_dr            AS new_total_dr,
  a.out_total_cr            AS old_total_cr, b.out_total_cr            AS new_total_cr,
  a.out_net_receivable      AS old_net_recv, b.out_net_receivable    AS new_net_recv
FROM a
FULL OUTER JOIN b ON b.out_customer_id = a.out_customer_id
WHERE a.out_customer_id IS NULL
   OR b.out_customer_id IS NULL
   OR a.out_signed_balance    IS DISTINCT FROM b.out_signed_balance
   OR a.out_advance_available IS DISTINCT FROM b.out_advance_available
   OR a.out_direction         IS DISTINCT FROM b.out_direction
   OR a.out_net_position      IS DISTINCT FROM b.out_net_position
   OR a.out_total_dr          IS DISTINCT FROM b.out_total_dr
   OR a.out_total_cr          IS DISTINCT FROM b.out_total_cr
   OR a.out_net_receivable    IS DISTINCT FROM b.out_net_receivable;
*/

-- ---------------------------------------------------------------------------
-- C) Performance gate (run after parity passes, on v2 only)
-- ---------------------------------------------------------------------------
/*
EXPLAIN (ANALYZE, BUFFERS)
SELECT count(*) FROM public._get_customer_party_balances_rows_v2('<ORG_UUID>'::uuid);
*/

-- ---------------------------------------------------------------------------
-- D) Ready-to-run block — replace <ORG_UUID> and execute sections B + A together
-- ---------------------------------------------------------------------------
-- Copy from here through end of diff query, replace all <ORG_UUID> occurrences:

WITH a AS (
  SELECT * FROM public._get_customer_party_balances_rows('<ORG_UUID>'::uuid)
), b AS (
  SELECT * FROM public._get_customer_party_balances_rows_v2('<ORG_UUID>'::uuid)
)
SELECT
  COALESCE(a.out_customer_id, b.out_customer_id) AS customer_id,
  a.out_signed_balance      AS old_signed,  b.out_signed_balance      AS new_signed,
  a.out_advance_available   AS old_adv,     b.out_advance_available   AS new_adv,
  a.out_direction           AS old_dir,     b.out_direction           AS new_dir,
  a.out_net_position        AS old_net,     b.out_net_position        AS new_net,
  a.out_total_dr            AS old_total_dr, b.out_total_dr            AS new_total_dr,
  a.out_total_cr            AS old_total_cr, b.out_total_cr            AS new_total_cr,
  a.out_net_receivable      AS old_net_recv, b.out_net_receivable    AS new_net_recv
FROM a
FULL OUTER JOIN b ON b.out_customer_id = a.out_customer_id
WHERE a.out_customer_id IS NULL
   OR b.out_customer_id IS NULL
   OR a.out_signed_balance    IS DISTINCT FROM b.out_signed_balance
   OR a.out_advance_available IS DISTINCT FROM b.out_advance_available
   OR a.out_direction         IS DISTINCT FROM b.out_direction
   OR a.out_net_position      IS DISTINCT FROM b.out_net_position
   OR a.out_total_dr          IS DISTINCT FROM b.out_total_dr
   OR a.out_total_cr          IS DISTINCT FROM b.out_total_cr
   OR a.out_net_receivable    IS DISTINCT FROM b.out_net_receivable;
