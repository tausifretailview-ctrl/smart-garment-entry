-- ============================================================================
-- PROD FIX: create the missing public.apply_pos_credit RPC
-- Run this once in the Supabase SQL editor (production project).
-- Source: supabase/migrations/20261223120000_apply_pos_credit.sql
-- Safe to re-run: ADD COLUMN IF NOT EXISTS / CREATE UNIQUE INDEX IF NOT
-- EXISTS / CREATE OR REPLACE FUNCTION are all idempotent.
-- Expect: "Success. No rows returned" for each block.
-- ============================================================================

-- Thin idempotent wrapper around adjust_invoice_balance for POS credit.
-- Does not change adjust_invoice_balance. A retry with the same key returns
-- the first application and does not redeem the note again.

ALTER TABLE public.invoice_adjustments
  ADD COLUMN IF NOT EXISTS idempotency_key text;

CREATE UNIQUE INDEX IF NOT EXISTS uq_invoice_adjustments_idempotency
  ON public.invoice_adjustments (organization_id, idempotency_key)
  WHERE idempotency_key IS NOT NULL;

CREATE OR REPLACE FUNCTION public.apply_pos_credit(
  p_organization_id uuid,
  p_sale_id uuid,
  p_idempotency_key text,
  p_source_document_id uuid,
  p_amount_applied numeric,
  p_adjusted_by uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  v_existing public.invoice_adjustments%ROWTYPE;
  v_result jsonb;
  v_adjustment_id uuid;
BEGIN
  IF auth.role() = 'anon'
     OR (auth.role() = 'authenticated'
         AND NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid())))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  IF p_idempotency_key IS NULL OR btrim(p_idempotency_key) = '' THEN
    RAISE EXCEPTION 'idempotency key required';
  END IF;

  IF p_amount_applied IS NULL OR p_amount_applied <= 0 THEN
    RAISE EXCEPTION 'Apply amount must be positive';
  END IF;

  SELECT * INTO v_existing
    FROM public.invoice_adjustments
   WHERE organization_id = p_organization_id
     AND idempotency_key = p_idempotency_key
   LIMIT 1;

  IF FOUND THEN
    RETURN jsonb_build_object(
      'success', true,
      'already_applied', true,
      'amount_applied', v_existing.amount_applied,
      'invoice_adjustment_id', v_existing.id,
      'voucher_entry_id', NULL,
      'voucher_number', NULL
    );
  END IF;

  v_result := public.adjust_invoice_balance(
    p_organization_id,
    p_sale_id,
    'CREDIT_NOTE',
    p_source_document_id,
    p_amount_applied,
    p_adjusted_by,
    p_notes
  );

  UPDATE public.invoice_adjustments
     SET idempotency_key = p_idempotency_key
   WHERE id = (
     SELECT id
       FROM public.invoice_adjustments
      WHERE organization_id = p_organization_id
        AND invoice_id = p_sale_id
        AND source_document_id = p_source_document_id
        AND adjustment_type = 'CREDIT_NOTE'
        AND idempotency_key IS NULL
      ORDER BY created_at DESC NULLS LAST, id DESC
      LIMIT 1
   )
   RETURNING id INTO v_adjustment_id;

  IF v_adjustment_id IS NULL THEN
    RAISE EXCEPTION 'Credit adjustment was not recorded for this idempotency key';
  END IF;

  RETURN COALESCE(v_result, '{}'::jsonb) || jsonb_build_object(
    'already_applied', false,
    'invoice_adjustment_id', v_adjustment_id
  );
EXCEPTION
  WHEN unique_violation THEN
    SELECT * INTO v_existing
      FROM public.invoice_adjustments
     WHERE organization_id = p_organization_id
       AND idempotency_key = p_idempotency_key;
    IF NOT FOUND THEN
      RAISE;
    END IF;
    RETURN jsonb_build_object(
      'success', true,
      'already_applied', true,
      'amount_applied', v_existing.amount_applied,
      'invoice_adjustment_id', v_existing.id
    );
END;
$$;

REVOKE ALL ON FUNCTION public.apply_pos_credit(uuid, uuid, text, uuid, numeric, uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.apply_pos_credit(uuid, uuid, text, uuid, numeric, uuid, text) TO authenticated, service_role;

-- Force PostgREST to pick up the new function immediately
-- (fixes the "in the schema cache" error even if caching was the issue).
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- VERIFY (run after the above, expect exactly 1 row, 7 args):
--   SELECT proname, pronargs FROM pg_proc WHERE proname = 'apply_pos_credit';
-- Then retry the failed POS credit redemption in the app.
-- ============================================================================
