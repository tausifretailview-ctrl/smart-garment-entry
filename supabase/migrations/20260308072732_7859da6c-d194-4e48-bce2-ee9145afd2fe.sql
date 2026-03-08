-- PRODUCTS: drop permissive policies
DROP POLICY IF EXISTS "Allow all operations on products for authenticated users" ON public.products;
DROP POLICY IF EXISTS "Allow read" ON public.products;
DROP POLICY IF EXISTS "Authenticated users can view products" ON public.products;

-- PRODUCT VARIANTS: drop permissive policies
DROP POLICY IF EXISTS "Allow all operations on product_variants for authenticated users" ON public.product_variants;
DROP POLICY IF EXISTS "Allow read" ON public.product_variants;
DROP POLICY IF EXISTS "Authenticated users can view product variants" ON public.product_variants;

-- PURCHASE BILLS & ITEMS: drop permissive policies
DROP POLICY IF EXISTS "Allow all operations on purchase_bills for authenticated users" ON public.purchase_bills;
DROP POLICY IF EXISTS "Allow all operations on purchase_items for authenticated users" ON public.purchase_items;

-- SALE ITEMS: drop permissive policy
DROP POLICY IF EXISTS "Authenticated users can view sale items" ON public.sale_items;

-- SIZE GROUPS: drop permissive policy
DROP POLICY IF EXISTS "Allow all operations on size_groups for authenticated users" ON public.size_groups;

-- BATCH STOCK: drop permissive policy
DROP POLICY IF EXISTS "System can manage batch stock" ON batch_stock;

-- BILL NUMBER SEQUENCE: drop permissive policy
DROP POLICY IF EXISTS "Functions can manage bill sequence" ON bill_number_sequence;

-- Now add correct org-scoped replacements
CREATE POLICY "org_products_select" ON public.products
  FOR SELECT USING (organization_id IN (
    SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "org_variants_select" ON public.product_variants
  FOR SELECT USING (organization_id IN (
    SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "org_sale_items_select" ON public.sale_items
  FOR SELECT USING (
    sale_id IN (SELECT id FROM public.sales WHERE
      organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))));

CREATE POLICY "org_batch_stock_all" ON batch_stock
  FOR ALL USING (organization_id IN (
    SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "org_bill_sequence_all" ON bill_number_sequence
  FOR ALL USING (organization_id IN (
    SELECT public.get_user_organization_ids(auth.uid())));