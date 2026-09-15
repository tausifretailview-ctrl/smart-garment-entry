-- One-time: clear ADEEBAAREEBA daily incentive snapshots computed under the old
-- flat day-total bracket formula. Rows repopulate from sale_items via the app
-- (per-unit bracket × qty) on next Daily Incentive load and past IST days re-lock.
-- Tag: [daily_incentive_per_unit_recalc_20260915]

DELETE FROM public.daily_salesman_incentive_days
WHERE organization_id = 'b230c582-4f0b-420f-b18b-bef26c2f5ce8';

COMMENT ON TABLE public.daily_salesman_incentive_days IS
  'Per-salesman per-IST-day incentive snapshot. Locked past days are not recomputed on refresh (returns must not reverse earned incentive). Snapshots cleared 2026-09-15 when per-unit formula replaced flat day-total bracket.';
