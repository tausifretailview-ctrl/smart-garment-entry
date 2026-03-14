
-- Step 1: Add cancellation columns to sales table
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS is_cancelled    BOOLEAN      NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS cancelled_at    TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS cancelled_by    UUID         REFERENCES auth.users(id),
  ADD COLUMN IF NOT EXISTS cancelled_reason TEXT;

CREATE INDEX IF NOT EXISTS idx_sales_is_cancelled
  ON public.sales(organization_id, is_cancelled, sale_date);

-- Step 2: Create the cancel_invoice RPC function
CREATE OR REPLACE FUNCTION public.cancel_invoice(
  p_sale_id UUID,
  p_reason  TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_sale_number  TEXT;
  v_is_cancelled BOOLEAN;
  v_deleted_at   TIMESTAMPTZ;
BEGIN
  SELECT sale_number, is_cancelled, deleted_at
  INTO   v_sale_number, v_is_cancelled, v_deleted_at
  FROM   sales
  WHERE  id = p_sale_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice not found');
  END IF;

  IF v_is_cancelled THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice is already cancelled');
  END IF;

  IF v_deleted_at IS NOT NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Invoice has been deleted');
  END IF;

  -- Delete sale_items first — the existing handle_sale_item_delete trigger
  -- automatically restores stock_qty for each variant on delete
  DELETE FROM sale_items WHERE sale_id = p_sale_id;

  -- Mark invoice as cancelled (stays in DB, visible in history)
  UPDATE sales SET
    is_cancelled      = true,
    cancelled_at      = NOW(),
    cancelled_by      = auth.uid(),
    cancelled_reason  = p_reason,
    payment_status    = 'cancelled',
    updated_at        = NOW()
  WHERE id = p_sale_id;

  -- Nullify linked receipt vouchers
  UPDATE voucher_entries
  SET    reference_type = 'cancelled_invoice',
         updated_at     = NOW()
  WHERE  reference_id  = p_sale_id
    AND  voucher_type  = 'receipt';

  RETURN jsonb_build_object(
    'success',     true,
    'sale_number', v_sale_number,
    'message',     'Invoice ' || v_sale_number || ' cancelled. Stock has been restored.'
  );

EXCEPTION
  WHEN OTHERS THEN
    RETURN jsonb_build_object('success', false, 'error', SQLERRM);
END;
$$;
