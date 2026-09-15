-- ADEEBAAREEBA daily salesman incentive — hand-check after per-unit formula deploy.
-- Org: b230c582-4f0b-420f-b18b-bef26c2f5ce8 (slug adeebaareeba)
--
-- Formula: day eligible when Σ qty ≥ qty_threshold; day incentive = Σ (bracket(full line net) × line qty).
-- Bracket per unit: [0,500)→3, [500,1000)→5, [1000,∞)→10 (from config table).

-- §1 Per-line detail for one salesman on one IST day (edit ymd + salesman)
WITH bounds AS (
  SELECT
    '2026-09-15T00:00:00.000+05:30'::timestamptz AS start_ts,
    '2026-09-15T23:59:59.999+05:30'::timestamptz AS end_ts
),
sales_day AS (
  SELECT s.id, s.salesman, s.sale_number
  FROM public.sales s, bounds b
  WHERE s.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.sale_date >= b.start_ts
    AND s.sale_date <= b.end_ts
    AND btrim(s.salesman) = 'MOHD ASHRAF FAROOQUI'
),
lines AS (
  SELECT
    sd.sale_number,
    si.quantity AS qty,
    COALESCE(si.net_after_discount, si.line_total, 0)::numeric AS line_net,
    CASE
      WHEN COALESCE(si.net_after_discount, si.line_total, 0) < 500 THEN 3
      WHEN COALESCE(si.net_after_discount, si.line_total, 0) < 1000 THEN 5
      ELSE 10
    END AS per_unit_inr
  FROM sales_day sd
  JOIN public.sale_items si
    ON si.sale_id = sd.id
   AND si.deleted_at IS NULL
  WHERE COALESCE(si.quantity, 0) > 0
)
SELECT
  sale_number,
  qty,
  line_net,
  per_unit_inr,
  (per_unit_inr * qty)::numeric AS line_incentive
FROM lines
ORDER BY sale_number;

-- §2 Day total for MOHD ASHRAF 2026-09-15 (compare to UI after refresh on Live day)
WITH bounds AS (
  SELECT
    '2026-09-15T00:00:00.000+05:30'::timestamptz AS start_ts,
    '2026-09-15T23:59:59.999+05:30'::timestamptz AS end_ts
),
sales_day AS (
  SELECT s.id, s.salesman
  FROM public.sales s, bounds b
  WHERE s.organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
    AND s.deleted_at IS NULL
    AND COALESCE(s.is_cancelled, false) = false
    AND s.sale_date >= b.start_ts
    AND s.sale_date <= b.end_ts
    AND btrim(s.salesman) = 'MOHD ASHRAF FAROOQUI'
),
lines AS (
  SELECT
    sd.salesman,
    si.quantity AS qty,
    COALESCE(si.net_after_discount, si.line_total, 0)::numeric AS line_net
  FROM sales_day sd
  JOIN public.sale_items si
    ON si.sale_id = sd.id
   AND si.deleted_at IS NULL
),
per_line AS (
  SELECT
    salesman,
    qty,
    line_net,
    CASE
      WHEN line_net < 500 THEN 3
      WHEN line_net < 1000 THEN 5
      ELSE 10
    END AS per_unit_inr
  FROM lines
  WHERE qty > 0
),
day_agg AS (
  SELECT
    salesman,
    SUM(qty) AS total_qty,
    SUM(line_net) AS total_net,
    SUM(
      CASE
        WHEN line_net < 500 THEN 3
        WHEN line_net < 1000 THEN 5
        ELSE 10
      END * qty
    ) AS line_incentive_sum
  FROM per_line
  GROUP BY salesman
)
SELECT
  salesman,
  total_qty,
  ROUND(total_net, 2) AS total_net,
  CASE WHEN total_qty < 5 THEN 0 ELSE line_incentive_sum END AS expected_incentive,
  total_qty >= 5 AS is_eligible
FROM day_agg;

-- §3 Sai Man gate: qty 4 → ₹0 (edit salesman name if needed)
-- §4 Locked rows under OLD formula — decide before bulk UPDATE:
-- SELECT employee_name, incentive_date, total_qty, incentive_amount, is_locked, computed_at
-- FROM public.daily_salesman_incentive_days
-- WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8'
--   AND is_locked = true
-- ORDER BY incentive_date DESC, employee_name;
