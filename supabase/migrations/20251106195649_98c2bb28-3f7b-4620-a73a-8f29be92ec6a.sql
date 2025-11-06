-- Allow public read access to products
CREATE POLICY "Allow read" ON products
FOR SELECT USING (true);

-- Allow public read access to product_variants
CREATE POLICY "Allow read" ON product_variants
FOR SELECT USING (true);