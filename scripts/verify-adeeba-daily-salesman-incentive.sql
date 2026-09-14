-- ADEEBAAREEBA daily salesman incentive — hand-check after migration apply.
-- Org: b230c582-4f0b-420f-b18b-bef26c2f5ce8 (slug adeebaareeba)
-- Migration: 20261218120000_daily_salesman_incentive.sql
--
-- Edit the ymd literals below, then compare to UI "Daily incentive" tab.

-- §1 Aggregate by salesman for one IST day (sale_date bounds, not created_at)
-- Net is summed per sale first to avoid double-counting when joining sale_items.
WITH bounds AS (
  SELECT
    '2026-09-10T00:00:00.000+05:30'::timestamptz AS start_ts,
    '2026-09-10T23:59:59.999+05:30'::timestamptz AS end_ts
),
sales_day AS (
  SELECT s.id, s.salesman, s.net_amount
  FROM public.sales s, bounds b
  WHERE s.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.sale_date >= b.start_ts
    AND s.sale_date <= b.end_ts
    AND NULLIF(btrim(s.salesman), '') IS NOT NULL
),
qty AS (
  SELECT sd.id AS sale_id, COALESCE(SUM(si.quantity), 0) AS qty
  FROM sales_day sd
  LEFT JOIN public.sale_items si
    ON si.sale_id = sd.id AND si.deleted_at IS NULL
  GROUP BY sd.id
)
SELECT
  sd.salesman,
  COALESCE(SUM(q.qty), 0) AS total_qty,
  ROUND(SUM(sd.net_amount)::numeric, 2) AS total_net,
  CASE
    WHEN COALESCE(SUM(q.qty), 0) < 5 THEN 0
    WHEN SUM(sd.net_amount) < 500 THEN 3
    WHEN SUM(sd.net_amount) < 1000 THEN 5
    ELSE 10
  END AS expected_incentive
FROM sales_day sd
JOIN qty q ON q.sale_id = sd.id
GROUP BY sd.salesman
ORDER BY sd.salesman;

-- §2 qty < 5 → expected_incentive = 0 (filter total_qty BETWEEN 1 AND 4)
-- §3 net exactly 1000 with qty ≥ 5 → ₹10
-- §4 null/blank salesman count (must not appear in §1)
SELECT COUNT(*) AS blank_salesman_sales
FROM public.sales s
WHERE s.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
  AND s.deleted_at IS NULL
  AND COALESCE(s.is_cancelled, false) = false
  AND NULLIF(btrim(s.salesman), '') IS NULL
  AND s.sale_date >= '2026-09-10T00:00:00.000+05:30'::timestamptz
  AND s.sale_date <= '2026-09-10T23:59:59.999+05:30'::timestamptz;

-- §5 Locked rows must not change after refresh
-- SELECT employee_name, incentive_date, total_qty, total_net_amount,
--        incentive_amount, is_locked, computed_at
-- FROM public.daily_salesman_incentive_days
-- WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
--   AND is_locked = true
-- ORDER BY incentive_date DESC, employee_name;

-- §6 Seeded config
SELECT * FROM public.daily_salesman_incentive_configs
WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8';

SELECT min_net_amount, max_net_amount, incentive_amount, sort_order
FROM public.daily_salesman_incentive_brackets
WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
ORDER BY sort_order;
