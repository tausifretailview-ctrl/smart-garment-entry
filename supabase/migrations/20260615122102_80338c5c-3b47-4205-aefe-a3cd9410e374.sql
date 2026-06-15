CREATE TABLE IF NOT EXISTS public.kidzstock_barcode_swap_20260615 (
  variant_id UUID PRIMARY KEY,
  old_barcode TEXT NOT NULL,
  new_barcode TEXT NOT NULL,
  swapped_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
GRANT ALL ON public.kidzstock_barcode_swap_20260615 TO service_role;
ALTER TABLE public.kidzstock_barcode_swap_20260615 ENABLE ROW LEVEL SECURITY;
CREATE POLICY "no client access" ON public.kidzstock_barcode_swap_20260615 FOR ALL USING (false) WITH CHECK (false);