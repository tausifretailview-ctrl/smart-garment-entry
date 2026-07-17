CREATE OR REPLACE FUNCTION public.invoice_reconcile_outstanding(
  p_net_amount        numeric,
  p_sale_return_adj   numeric,
  p_paid_residual     numeric,
  p_cash              numeric,
  p_cn                numeric,
  p_adv               numeric,
  p_discount          numeric,
  p_items_gross       numeric
)
RETURNS numeric
LANGUAGE plpgsql
IMMUTABLE
PARALLEL SAFE
AS $$
DECLARE
  INVOICE_RECON_TOL             CONSTANT numeric := 0.01;
  DUPLICATE_CN_PAID_MATCH_TOL   CONSTANT numeric := 1;

  v_net           numeric := COALESCE(p_net_amount, 0);
  v_sr            numeric := COALESCE(p_sale_return_adj, 0);
  v_cash          numeric := COALESCE(p_cash, 0);
  v_cn            numeric := COALESCE(p_cn, 0);
  v_adv           numeric := COALESCE(p_adv, 0);
  v_discount      numeric := COALESCE(p_discount, 0);
  v_items_gross   numeric := p_items_gross;

  -- Option 1: reconstruct raw salePaid. Matches TS exactly when cash+adv+cn <= paid_amount.
  v_sale_paid     numeric := COALESCE(p_paid_residual, 0) + v_cash + v_adv + v_cn;

  v_adv_cn                numeric;
  v_effective_cash        numeric;
  v_sr_applied_on_top     boolean;
  v_payable               numeric;
  v_exposure_after_cash   numeric;
  v_cn_not_in_sr          numeric;
  v_capped_non_cash       numeric;
  v_outstanding           numeric;
BEGIN
  v_sr_applied_on_top :=
    v_items_gross IS NOT NULL
    AND v_items_gross > INVOICE_RECON_TOL
    AND v_sr > INVOICE_RECON_TOL
    AND (v_net + v_sr) > (v_items_gross + DUPLICATE_CN_PAID_MATCH_TOL);

  v_adv_cn         := v_adv + v_cn;
  v_effective_cash := GREATEST(0, v_sale_paid - v_adv_cn) + v_cash + v_discount;

  IF v_sr > INVOICE_RECON_TOL
     AND abs(v_sale_paid - v_sr) <= DUPLICATE_CN_PAID_MATCH_TOL THEN
    v_effective_cash := GREATEST(0, v_cash);
  END IF;

  v_payable := CASE WHEN v_sr_applied_on_top
                    THEN GREATEST(0, v_net - v_sr)
                    ELSE v_net END;

  v_exposure_after_cash := GREATEST(0, v_payable - v_effective_cash);
  v_cn_not_in_sr        := GREATEST(0, v_cn - GREATEST(0, v_sr));
  v_capped_non_cash     := LEAST(v_exposure_after_cash, v_adv + v_cn_not_in_sr + v_discount);

  v_outstanding := GREATEST(0, round(v_payable - v_effective_cash - v_capped_non_cash));

  RETURN v_outstanding;
END;
$$;

GRANT EXECUTE ON FUNCTION public.invoice_reconcile_outstanding(
  numeric, numeric, numeric, numeric, numeric, numeric, numeric, numeric
) TO authenticated, service_role;