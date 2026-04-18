
-- ============================================================
-- Combined Security Cleanup Migration
-- ============================================================

-- 1) login_attempts rate guard (uses 'identifier' column)
CREATE OR REPLACE FUNCTION public.login_attempts_rate_guard()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  -- Force server-side timestamp; ignore client-supplied value
  NEW.last_attempt_at := COALESCE(NEW.last_attempt_at, now());
  IF NEW.last_attempt_at > now() + interval '5 seconds'
     OR NEW.last_attempt_at < now() - interval '1 minute' THEN
    NEW.last_attempt_at := now();
  END IF;

  -- Throttle: max 1 new row per identifier per 2 seconds
  IF EXISTS (
    SELECT 1 FROM public.login_attempts
    WHERE identifier = NEW.identifier
      AND last_attempt_at > now() - interval '2 seconds'
  ) THEN
    RAISE EXCEPTION 'rate_limited: too many login attempts'
      USING ERRCODE = '42501';
  END IF;

  RETURN NEW;
END $$;

DROP POLICY IF EXISTS "Anon can insert login attempts" ON public.login_attempts;

CREATE POLICY "anon_insert_rate_limited"
  ON public.login_attempts
  FOR INSERT
  TO anon
  WITH CHECK (identifier IS NOT NULL AND length(identifier) <= 320);

DROP TRIGGER IF EXISTS trg_login_attempts_rate_guard ON public.login_attempts;
CREATE TRIGGER trg_login_attempts_rate_guard
  BEFORE INSERT ON public.login_attempts
  FOR EACH ROW EXECUTE FUNCTION public.login_attempts_rate_guard();

-- 2) Flip 8 dashboard views to security_invoker
ALTER VIEW public.v_dashboard_counts            SET (security_invoker = true);
ALTER VIEW public.v_dashboard_gross_profit      SET (security_invoker = true);
ALTER VIEW public.v_dashboard_purchase_returns  SET (security_invoker = true);
ALTER VIEW public.v_dashboard_purchase_summary  SET (security_invoker = true);
ALTER VIEW public.v_dashboard_receivables       SET (security_invoker = true);
ALTER VIEW public.v_dashboard_sale_returns      SET (security_invoker = true);
ALTER VIEW public.v_dashboard_sales_summary     SET (security_invoker = true);
ALTER VIEW public.v_dashboard_stock_summary     SET (security_invoker = true);

-- 3) Pin search_path on 7 flagged functions
ALTER FUNCTION public.generate_challan_number(uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_fee_receipt_number(uuid, integer, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_purchase_bill_number(date, uuid)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.generate_voucher_number(text, date)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.get_product_dashboard_stats(uuid, text, text, text, uuid, text, numeric, numeric)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.peek_fee_receipt_number(uuid, integer, integer)
  SET search_path = public, pg_temp;
ALTER FUNCTION public.update_purchase_bill_total_qty()
  SET search_path = public, pg_temp;

-- 4) Storage: block public listing on sensitive buckets
DROP POLICY IF EXISTS "Allow public read of supplier-bill-images" ON storage.objects;
DROP POLICY IF EXISTS "Anyone can view invoice PDFs" ON storage.objects;

CREATE POLICY "supplier_bills_org_members_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'supplier-bill-images'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

CREATE POLICY "invoice_pdfs_org_members_select"
  ON storage.objects
  FOR SELECT
  TO authenticated
  USING (
    bucket_id = 'invoice-pdfs'
    AND (storage.foldername(name))[1] IN (
      SELECT om.organization_id::text
      FROM public.organization_members om
      WHERE om.user_id = auth.uid()
    )
  );

UPDATE storage.buckets
   SET public = false
 WHERE id IN ('supplier-bill-images', 'invoice-pdfs');
