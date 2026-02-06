-- Create product_images table for storing multiple images per product
CREATE TABLE public.product_images (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  product_id UUID NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  organization_id UUID NOT NULL REFERENCES public.organizations(id) ON DELETE CASCADE,
  image_url TEXT NOT NULL,
  display_order INTEGER NOT NULL DEFAULT 1 CHECK (display_order >= 1 AND display_order <= 3),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Create unique constraint to prevent duplicate orders per product
CREATE UNIQUE INDEX idx_product_images_order ON public.product_images(product_id, display_order);

-- Create index for faster lookups by product
CREATE INDEX idx_product_images_product_id ON public.product_images(product_id);

-- Create index for organization filtering
CREATE INDEX idx_product_images_organization_id ON public.product_images(organization_id);

-- Enable Row Level Security
ALTER TABLE public.product_images ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Users can view product images for their organization"
ON public.product_images
FOR SELECT
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can insert product images for their organization"
ON public.product_images
FOR INSERT
WITH CHECK (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can update product images for their organization"
ON public.product_images
FOR UPDATE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

CREATE POLICY "Users can delete product images for their organization"
ON public.product_images
FOR DELETE
USING (
  organization_id IN (
    SELECT organization_id FROM public.organization_members WHERE user_id = auth.uid()
  )
);

-- Migrate existing product images to the new table
INSERT INTO public.product_images (product_id, organization_id, image_url, display_order)
SELECT id, organization_id, image_url, 1
FROM public.products
WHERE image_url IS NOT NULL AND image_url != '' AND organization_id IS NOT NULL;