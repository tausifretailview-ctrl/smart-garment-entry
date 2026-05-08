CREATE OR REPLACE FUNCTION public.adjust_invoice_balance(
    p_organization_id uuid,
    p_invoice_id uuid,
    p_adjustment_type text,
    p_source_document_id uuid,
    p_amount_applied numeric,
    p_adjusted_by uuid DEFAULT NULL::uuid,
    p_notes text DEFAULT NULL::text
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
    v_net_amount NUMERIC;
    v_paid_amount NUMERIC;
    v_credit_applied NUMERIC;
    v_invoice_balance NUMERIC;
    v_current_status TEXT;
    v_new_status TEXT;
    v_remaining NUMERIC;

    v_source_total_amount NUMERIC;
    v_source_used_amount NUMERIC;
    v_source_balance NUMERIC;
BEGIN
    SELECT net_amount, paid_amount, credit_applied, payment_status
    INTO v_net_amount, v_paid_amount, v_credit_applied, v_current_status
    FROM sales
    WHERE id = p_invoice_id AND organization_id = p_organization_id
    FOR UPDATE;

    IF NOT FOUND THEN
        RAISE EXCEPTION 'Sale/Invoice not found';
    END IF;

    v_invoice_balance := COALESCE(v_net_amount, 0) - COALESCE(v_paid_amount, 0) - COALESCE(v_credit_applied, 0);

    IF v_invoice_balance < p_amount_applied THEN
        RAISE EXCEPTION 'Adjustment amount (%) exceeds invoice balance (%)', p_amount_applied, v_invoice_balance;
    END IF;

    IF p_adjustment_type = 'CREDIT_NOTE' THEN
        SELECT credit_amount, used_amount INTO v_source_total_amount, v_source_used_amount
        FROM credit_notes
        WHERE id = p_source_document_id AND organization_id = p_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Credit Note not found';
        END IF;

        v_source_balance := COALESCE(v_source_total_amount, 0) - COALESCE(v_source_used_amount, 0);

        IF v_source_balance < p_amount_applied THEN
            RAISE EXCEPTION 'Adjustment amount exceeds available credit note balance';
        END IF;

        UPDATE credit_notes
        SET
            used_amount = COALESCE(used_amount, 0) + p_amount_applied,
            status = CASE
                        WHEN (COALESCE(credit_amount, 0) - (COALESCE(used_amount, 0) + p_amount_applied)) <= 0.01 THEN 'fully_used'
                        ELSE 'partially_used'
                     END
        WHERE id = p_source_document_id;

    ELSIF p_adjustment_type = 'ADVANCE_PAYMENT' THEN
        SELECT amount, used_amount INTO v_source_total_amount, v_source_used_amount
        FROM customer_advances
        WHERE id = p_source_document_id AND organization_id = p_organization_id
        FOR UPDATE;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Advance Payment not found';
        END IF;

        v_source_balance := COALESCE(v_source_total_amount, 0) - COALESCE(v_source_used_amount, 0);

        IF v_source_balance < p_amount_applied THEN
            RAISE EXCEPTION 'Adjustment amount exceeds available advance balance';
        END IF;

        UPDATE customer_advances
        SET
            used_amount = COALESCE(used_amount, 0) + p_amount_applied,
            status = CASE
                        WHEN (COALESCE(amount, 0) - (COALESCE(used_amount, 0) + p_amount_applied)) <= 0.01 THEN 'fully_used'
                        ELSE 'partially_used'
                     END
        WHERE id = p_source_document_id;
    END IF;

    v_remaining := COALESCE(v_net_amount, 0) - (COALESCE(v_paid_amount, 0) + COALESCE(v_credit_applied, 0) + p_amount_applied);

    IF v_current_status IN ('hold', 'cancelled') THEN
        v_new_status := v_current_status;
    ELSIF v_remaining <= 0.01 THEN
        v_new_status := 'completed';
    ELSIF (COALESCE(v_paid_amount, 0) + COALESCE(v_credit_applied, 0) + p_amount_applied) > 0 THEN
        v_new_status := 'partial';
    ELSE
        v_new_status := 'pending';
    END IF;

    UPDATE sales
    SET
        credit_applied = COALESCE(credit_applied, 0) + p_amount_applied,
        payment_status = v_new_status
    WHERE id = p_invoice_id;

    INSERT INTO invoice_adjustments (
        organization_id, invoice_id, adjustment_type, source_document_id, amount_applied, adjusted_by, notes
    ) VALUES (
        p_organization_id, p_invoice_id, p_adjustment_type, p_source_document_id, p_amount_applied, p_adjusted_by, p_notes
    );

    RETURN TRUE;
EXCEPTION
    WHEN OTHERS THEN
        RAISE EXCEPTION 'Adjustment failed: %', SQLERRM;
        RETURN FALSE;
END;
$function$;