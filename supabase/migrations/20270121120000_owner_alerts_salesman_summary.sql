-- Owner alerts: optional salesman summary in cashier report and day-end alerts.
-- Additive: one column, off by default.
ALTER TABLE public.owner_alert_settings
  ADD COLUMN IF NOT EXISTS salesman_summary_enabled boolean NOT NULL DEFAULT false;
