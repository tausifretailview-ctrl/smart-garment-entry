-- Create barcode sequence table for centralized barcode generation
CREATE TABLE IF NOT EXISTS public.barcode_sequence (
  id INTEGER PRIMARY KEY DEFAULT 1,
  next_barcode BIGINT NOT NULL DEFAULT 10001001,
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
  CONSTRAINT single_row_only CHECK (id = 1)
);

-- Initialize with current max barcode from product_variants
INSERT INTO public.barcode_sequence (id, next_barcode)
SELECT 1, COALESCE(MAX(CAST(barcode AS BIGINT)) + 1, 10001001)
FROM public.product_variants
WHERE barcode ~ '^[0-9]+$' AND CAST(barcode AS BIGINT) >= 10001001
ON CONFLICT (id) DO NOTHING;

-- Enable RLS on barcode_sequence
ALTER TABLE public.barcode_sequence ENABLE ROW LEVEL SECURITY;

-- Allow authenticated users to read the sequence
CREATE POLICY "Authenticated users can view barcode sequence"
ON public.barcode_sequence FOR SELECT
USING (auth.uid() IS NOT NULL);

-- Create function to generate next barcode with atomic locking
CREATE OR REPLACE FUNCTION public.generate_next_barcode()
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  new_barcode BIGINT;
BEGIN
  -- Use SELECT FOR UPDATE to lock the row and prevent race conditions
  UPDATE public.barcode_sequence
  SET 
    next_barcode = next_barcode + 1,
    updated_at = now()
  WHERE id = 1
  RETURNING next_barcode - 1 INTO new_barcode;
  
  -- Return as text (padded to 8 digits for consistency)
  RETURN LPAD(new_barcode::TEXT, 8, '0');
END;
$$;

-- Grant execute permission to authenticated users
GRANT EXECUTE ON FUNCTION public.generate_next_barcode() TO authenticated;

-- Create index for faster lookups
CREATE INDEX IF NOT EXISTS idx_product_variants_barcode ON public.product_variants(barcode);