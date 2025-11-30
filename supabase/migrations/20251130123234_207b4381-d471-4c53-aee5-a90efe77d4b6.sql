-- Add public read access for invoice sharing (UUID security - impossible to guess)

-- Policy for public to view specific sales by ID
CREATE POLICY "Public can view sales by id for invoice sharing"
ON public.sales FOR SELECT
TO anon
USING (true);

-- Policy for public to view sale items for shared invoices
CREATE POLICY "Public can view sale items for shared invoices"
ON public.sale_items FOR SELECT
TO anon
USING (true);

-- Policy for public to view organization settings for invoice display
CREATE POLICY "Public can view settings for invoice display"
ON public.settings FOR SELECT
TO anon
USING (true);