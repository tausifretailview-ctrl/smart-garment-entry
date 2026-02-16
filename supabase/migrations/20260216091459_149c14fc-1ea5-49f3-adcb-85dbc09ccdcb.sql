
-- Fix overly permissive RLS policies

-- 1. batch_stock
DROP POLICY IF EXISTS "System can manage batch stock" ON public.batch_stock;
DROP POLICY IF EXISTS "Org members can view batch stock" ON public.batch_stock;
DROP POLICY IF EXISTS "System triggers can manage batch stock" ON public.batch_stock;

CREATE POLICY "Org members can view batch stock"
ON public.batch_stock FOR SELECT TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can manage batch stock"
ON public.batch_stock FOR ALL TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 2. stock_movements
DROP POLICY IF EXISTS "System can manage stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "Org members can view stock movements" ON public.stock_movements;
DROP POLICY IF EXISTS "System triggers can manage stock movements" ON public.stock_movements;

CREATE POLICY "Org members can view stock movements"
ON public.stock_movements FOR SELECT TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can insert stock movements"
ON public.stock_movements FOR INSERT TO authenticated
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 3. bill_number_sequence
DROP POLICY IF EXISTS "Functions can manage bill sequence" ON public.bill_number_sequence;
DROP POLICY IF EXISTS "Org members can manage bill sequence" ON public.bill_number_sequence;

CREATE POLICY "Org members can manage bill sequence"
ON public.bill_number_sequence FOR ALL TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 4. whatsapp_conversations
DROP POLICY IF EXISTS "Service role can manage conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Org members can view conversations" ON public.whatsapp_conversations;
DROP POLICY IF EXISTS "Org members can manage conversations" ON public.whatsapp_conversations;

CREATE POLICY "Org members can view conversations"
ON public.whatsapp_conversations FOR SELECT TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can manage conversations"
ON public.whatsapp_conversations FOR ALL TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 5. whatsapp_messages
DROP POLICY IF EXISTS "Service role can manage messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Org members can view messages" ON public.whatsapp_messages;
DROP POLICY IF EXISTS "Org members can manage messages" ON public.whatsapp_messages;

CREATE POLICY "Org members can view messages"
ON public.whatsapp_messages FOR SELECT TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

CREATE POLICY "Org members can manage messages"
ON public.whatsapp_messages FOR ALL TO authenticated
USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))
WITH CHECK (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- Fix search_path on functions missing it
ALTER FUNCTION public.update_stock_on_sale() SET search_path = public;
ALTER FUNCTION public.check_organization_type() SET search_path = public;
ALTER FUNCTION public.update_school_updated_at_column() SET search_path = public;
ALTER FUNCTION public.generate_advance_number(uuid) SET search_path = public;
