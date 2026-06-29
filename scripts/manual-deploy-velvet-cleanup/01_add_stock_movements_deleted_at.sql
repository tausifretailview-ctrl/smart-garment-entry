ALTER TABLE public.stock_movements
  ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
