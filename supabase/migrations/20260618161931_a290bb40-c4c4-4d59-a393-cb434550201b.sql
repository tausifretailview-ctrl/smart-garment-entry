
-- 1) Add created_by to purchase_bills (matches sales.created_by / voucher_entries.created_by)
ALTER TABLE public.purchase_bills
  ADD COLUMN IF NOT EXISTS created_by uuid DEFAULT auth.uid();

-- Update the atomic save RPC so created_by is recorded on new bills.
CREATE OR REPLACE FUNCTION public.save_purchase_bill_with_items_atomic(
  p_organization_id uuid,
  p_bill jsonb,
  p_items jsonb
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_bill_no text;
  v_bill_id uuid;
  v_bad_line integer;
  v_bad_sku text;
  v_inserted_bill public.purchase_bills%ROWTYPE;
BEGIN
  IF p_organization_id IS NULL THEN
    RAISE EXCEPTION 'organization_id is required';
  END IF;

  IF auth.uid() IS NOT NULL
     AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for organization %', p_organization_id;
  END IF;

  IF p_bill IS NULL OR p_items IS NULL OR jsonb_typeof(p_items) <> 'array' THEN
    RAISE EXCEPTION 'p_bill and p_items (array) are required';
  END IF;

  IF jsonb_array_length(p_items) = 0 THEN
    RAISE EXCEPTION 'At least one purchase line item is required';
  END IF;

  PERFORM set_config('statement_timeout', '300s', true);

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE(t.value->>'sku_id', '') = ''
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: sku_id is required', v_bad_line;
  END IF;

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE((t.value->>'qty')::numeric, 0) <= 0
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: qty must be greater than 0', v_bad_line;
  END IF;

  SELECT t.ordinality::integer
  INTO v_bad_line
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE COALESCE(t.value->>'product_id', '') = ''
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: product_id is required', v_bad_line;
  END IF;

  SELECT t.ordinality::integer, t.value->>'sku_id'
  INTO v_bad_line, v_bad_sku
  FROM jsonb_array_elements(p_items) WITH ORDINALITY AS t(value, ordinality)
  WHERE NOT EXISTS (
    SELECT 1
    FROM public.product_variants pv
    WHERE pv.id = (t.value->>'sku_id')::uuid
      AND pv.deleted_at IS NULL
      AND pv.organization_id = p_organization_id
  )
  ORDER BY t.ordinality
  LIMIT 1;
  IF v_bad_line IS NOT NULL THEN
    RAISE EXCEPTION 'Line %: variant % not found for organization', v_bad_line, v_bad_sku;
  END IF;

  v_bill_no := public.generate_purchase_bill_number_atomic(p_organization_id);

  INSERT INTO public.purchase_bills (
    software_bill_no,
    organization_id,
    supplier_id,
    supplier_name,
    supplier_invoice_no,
    supplier_inv_auto_generated,
    bill_date,
    bill_entry_at,
    gross_amount,
    discount_amount,
    gst_amount,
    other_charges,
    net_amount,
    round_off,
    is_dc_purchase,
    created_by
  )
  VALUES (
    v_bill_no,
    p_organization_id,
    NULLIF(p_bill->>'supplier_id', '')::uuid,
    COALESCE(p_bill->>'supplier_name', ''),
    NULLIF(p_bill->>'supplier_invoice_no', ''),
    COALESCE((p_bill->>'supplier_inv_auto_generated')::boolean, false),
    COALESCE((p_bill->>'bill_date')::date, CURRENT_DATE),
    COALESCE((p_bill->>'bill_entry_at')::timestamptz, NOW()),
    COALESCE((p_bill->>'gross_amount')::numeric, 0),
    COALESCE((p_bill->>'discount_amount')::numeric, 0),
    COALESCE((p_bill->>'gst_amount')::numeric, 0),
    COALESCE((p_bill->>'other_charges')::numeric, 0),
    COALESCE((p_bill->>'net_amount')::numeric, 0),
    COALESCE((p_bill->>'round_off')::numeric, 0),
    COALESCE((p_bill->>'is_dc_purchase')::boolean, false),
    auth.uid()
  )
  RETURNING * INTO v_inserted_bill;

  v_bill_id := v_inserted_bill.id;

  PERFORM set_config('app.bulk_purchase_insert', '1', true);

  INSERT INTO public.purchase_items (
    bill_id,
    product_id,
    sku_id,
    product_name,
    size,
    qty,
    pur_price,
    sale_price,
    mrp,
    gst_per,
    hsn_code,
    barcode,
    line_total,
    bill_number,
    brand,
    category,
    color,
    style,
    is_dc_item
  )
  SELECT
    v_bill_id,
    (item->>'product_id')::uuid,
    (item->>'sku_id')::uuid,
    item->>'product_name',
    COALESCE(item->>'size', ''),
    COALESCE((item->>'qty')::numeric, 0),
    COALESCE((item->>'pur_price')::numeric, 0),
    COALESCE((item->>'sale_price')::numeric, 0),
    COALESCE((item->>'mrp')::numeric, 0),
    COALESCE((item->>'gst_per')::numeric, 0),
    NULLIF(item->>'hsn_code', ''),
    NULLIF(item->>'barcode', ''),
    COALESCE((item->>'line_total')::numeric, 0),
    v_bill_no,
    NULLIF(item->>'brand', ''),
    NULLIF(item->>'category', ''),
    NULLIF(item->>'color', ''),
    NULLIF(item->>'style', ''),
    COALESCE((item->>'is_dc_item')::boolean, false)
  FROM jsonb_array_elements(p_items) AS item;

  PERFORM set_config('app.bulk_purchase_insert', '', true);

  RETURN jsonb_build_object(
    'id', v_inserted_bill.id,
    'software_bill_no', v_inserted_bill.software_bill_no,
    'organization_id', v_inserted_bill.organization_id,
    'supplier_id', v_inserted_bill.supplier_id,
    'supplier_name', v_inserted_bill.supplier_name,
    'supplier_invoice_no', v_inserted_bill.supplier_invoice_no,
    'supplier_inv_auto_generated', v_inserted_bill.supplier_inv_auto_generated,
    'bill_date', v_inserted_bill.bill_date,
    'bill_entry_at', v_inserted_bill.bill_entry_at,
    'gross_amount', v_inserted_bill.gross_amount,
    'discount_amount', v_inserted_bill.discount_amount,
    'gst_amount', v_inserted_bill.gst_amount,
    'other_charges', v_inserted_bill.other_charges,
    'net_amount', v_inserted_bill.net_amount,
    'round_off', v_inserted_bill.round_off,
    'is_dc_purchase', v_inserted_bill.is_dc_purchase,
    'created_by', v_inserted_bill.created_by,
    'created_at', v_inserted_bill.created_at
  );
END;
$function$;

-- 2) Helper: caller is admin/owner OR original creator (or row has no creator / no auth).
-- We do not have an owner role separately; "admin" is the elevated role in this project.
CREATE OR REPLACE FUNCTION public.is_entry_creator_or_admin(
  _organization_id uuid,
  _created_by uuid
)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    auth.uid() IS NULL
    OR _created_by IS NULL
    OR _created_by = auth.uid()
    OR public.has_org_role(auth.uid(), _organization_id, 'admin'::app_role);
$$;

GRANT EXECUTE ON FUNCTION public.is_entry_creator_or_admin(uuid, uuid) TO authenticated, service_role;

-- 3) Tighten RLS — sales (UPDATE + DELETE)
DROP POLICY IF EXISTS "Admins and managers can update sales" ON public.sales;
DROP POLICY IF EXISTS "Admins can delete sales" ON public.sales;

CREATE POLICY "Creator or admin can update sales"
ON public.sales
FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND public.is_entry_creator_or_admin(organization_id, created_by)
)
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND public.is_entry_creator_or_admin(organization_id, created_by)
);

CREATE POLICY "Creator or admin can delete sales"
ON public.sales
FOR DELETE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND public.is_entry_creator_or_admin(organization_id, created_by)
);

-- 4) Tighten RLS — purchase_bills (replace the single ALL policy with split rules)
DROP POLICY IF EXISTS "Admins and managers can manage purchase bills" ON public.purchase_bills;

CREATE POLICY "Admins and managers can insert purchase bills"
ON public.purchase_bills
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Creator or admin can update purchase bills"
ON public.purchase_bills
FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND public.is_entry_creator_or_admin(organization_id, created_by)
)
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND public.is_entry_creator_or_admin(organization_id, created_by)
);

CREATE POLICY "Creator or admin can delete purchase bills"
ON public.purchase_bills
FOR DELETE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND public.is_entry_creator_or_admin(organization_id, created_by)
);

-- 5) Tighten RLS — voucher_entries (replace ALL policy with split rules)
DROP POLICY IF EXISTS "Admins and managers can manage vouchers" ON public.voucher_entries;

CREATE POLICY "Admins and managers can insert vouchers"
ON public.voucher_entries
FOR INSERT
TO authenticated
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
);

CREATE POLICY "Creator or admin can update vouchers"
ON public.voucher_entries
FOR UPDATE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND public.is_entry_creator_or_admin(organization_id, created_by)
)
WITH CHECK (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND public.is_entry_creator_or_admin(organization_id, created_by)
);

CREATE POLICY "Creator or admin can delete vouchers"
ON public.voucher_entries
FOR DELETE
TO authenticated
USING (
  public.user_belongs_to_org(auth.uid(), organization_id)
  AND (
    public.has_org_role(auth.uid(), organization_id, 'admin'::app_role)
    OR public.has_org_role(auth.uid(), organization_id, 'manager'::app_role)
  )
  AND public.is_entry_creator_or_admin(organization_id, created_by)
);
