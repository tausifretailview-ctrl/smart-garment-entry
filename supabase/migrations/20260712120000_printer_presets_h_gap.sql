-- Horizontal gap between multi-up thermal / A4 columns (mm). Default 0 preserves existing output.
ALTER TABLE public.printer_presets
  ADD COLUMN IF NOT EXISTS h_gap numeric NOT NULL DEFAULT 0;

ALTER TABLE public.printer_presets_backup
  ADD COLUMN IF NOT EXISTS h_gap numeric;
