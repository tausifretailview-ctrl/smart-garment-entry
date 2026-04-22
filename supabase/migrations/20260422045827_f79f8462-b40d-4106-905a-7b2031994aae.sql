ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS held_cart_data jsonb DEFAULT NULL;

COMMENT ON COLUMN public.sales.held_cart_data IS
  'Stores serialized cart state when a sale is put on hold. Separate from notes.';