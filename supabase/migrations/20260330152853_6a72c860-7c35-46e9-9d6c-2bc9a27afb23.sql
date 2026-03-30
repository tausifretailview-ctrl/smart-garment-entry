
-- Add image_url and is_locked columns to purchase_bills
ALTER TABLE purchase_bills
  ADD COLUMN IF NOT EXISTS bill_image_url text DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS is_locked boolean DEFAULT false NOT NULL;

-- Create storage bucket for supplier bill images
INSERT INTO storage.buckets (id, name, public)
VALUES ('supplier-bill-images', 'supplier-bill-images', true)
ON CONFLICT (id) DO NOTHING;

-- Storage policy: allow org members to upload
CREATE POLICY "Allow authenticated uploads to supplier-bill-images"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'supplier-bill-images' AND auth.role() = 'authenticated');

CREATE POLICY "Allow public read of supplier-bill-images"
ON storage.objects FOR SELECT
USING (bucket_id = 'supplier-bill-images');

CREATE POLICY "Allow authenticated delete of supplier-bill-images"
ON storage.objects FOR DELETE
USING (bucket_id = 'supplier-bill-images' AND auth.role() = 'authenticated');
