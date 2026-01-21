-- Phase 1: Security Hardening - RLS Policy Updates (Fixed)

-- 1.1 Drop and recreate batch_stock RLS policies
DROP POLICY IF EXISTS "System can manage batch stock" ON batch_stock;
DROP POLICY IF EXISTS "Users can view batch stock in their organizations" ON batch_stock;
DROP POLICY IF EXISTS "Only service role can modify batch stock" ON batch_stock;
DROP POLICY IF EXISTS "Only service role can update batch stock" ON batch_stock;
DROP POLICY IF EXISTS "Only service role can delete batch stock" ON batch_stock;

-- Users can only SELECT their organization's data
CREATE POLICY "Org members can view batch stock"
  ON batch_stock FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Only service role (triggers) can modify - no direct user access
CREATE POLICY "Service role can insert batch stock"
  ON batch_stock FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

CREATE POLICY "Service role can update batch stock"
  ON batch_stock FOR UPDATE
  USING (auth.uid() IS NULL)
  WITH CHECK (auth.uid() IS NULL);

CREATE POLICY "Service role can delete batch stock"
  ON batch_stock FOR DELETE
  USING (auth.uid() IS NULL);

-- 1.2 Drop and recreate stock_movements RLS policies
DROP POLICY IF EXISTS "Users can view stock movements in their organizations" ON stock_movements;
DROP POLICY IF EXISTS "System can insert stock movements" ON stock_movements;
DROP POLICY IF EXISTS "Users can view stock movements in their orgs" ON stock_movements;
DROP POLICY IF EXISTS "Only service role can insert stock movements" ON stock_movements;

-- Users can only SELECT their organization's data
CREATE POLICY "Org members can view stock movements"
  ON stock_movements FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Only service role (triggers) can INSERT
CREATE POLICY "Service role can insert stock movements"
  ON stock_movements FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

-- 1.3 Drop and recreate bill_number_sequence RLS policies
DROP POLICY IF EXISTS "System can manage sequences" ON bill_number_sequence;
DROP POLICY IF EXISTS "Users can view bill sequences in their orgs" ON bill_number_sequence;
DROP POLICY IF EXISTS "Only service role can insert sequences" ON bill_number_sequence;
DROP POLICY IF EXISTS "Only service role can update sequences" ON bill_number_sequence;

-- Users can only SELECT their organization's data
CREATE POLICY "Org members can view bill sequences"
  ON bill_number_sequence FOR SELECT
  USING (organization_id IN (SELECT get_user_organization_ids(auth.uid())));

-- Only service role can modify sequences
CREATE POLICY "Service role can insert sequences"
  ON bill_number_sequence FOR INSERT
  WITH CHECK (auth.uid() IS NULL);

CREATE POLICY "Service role can update sequences"
  ON bill_number_sequence FOR UPDATE
  USING (auth.uid() IS NULL)
  WITH CHECK (auth.uid() IS NULL);

-- 1.4 Restrict WhatsApp token access to admins only
DROP POLICY IF EXISTS "Users can view their organization whatsapp settings" ON whatsapp_api_settings;
DROP POLICY IF EXISTS "Admins can view organization whatsapp settings" ON whatsapp_api_settings;

CREATE POLICY "Admins can view whatsapp settings"
  ON whatsapp_api_settings FOR SELECT
  USING (has_org_role(auth.uid(), organization_id, 'admin'));

-- 1.5 Add search_path security to critical functions
ALTER FUNCTION user_belongs_to_org SET search_path = public;
ALTER FUNCTION get_user_organization_ids SET search_path = public;
ALTER FUNCTION has_org_role SET search_path = public;
ALTER FUNCTION has_role SET search_path = public;

-- 1.6 Create security event logging function
CREATE OR REPLACE FUNCTION log_security_event(
  p_event_type TEXT,
  p_user_id UUID,
  p_organization_id UUID,
  p_details JSONB
) RETURNS void AS $$
BEGIN
  INSERT INTO audit_logs (
    organization_id,
    action, 
    entity_type, 
    entity_id, 
    user_id,
    new_values,
    metadata
  ) VALUES (
    p_organization_id,
    'SECURITY_EVENT',
    p_event_type,
    COALESCE(p_user_id::text, 'anonymous'),
    p_user_id,
    p_details,
    jsonb_build_object('timestamp', now())
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;