-- Read-only scope: how many existing sales would reprint differently after
-- the Retail ERP page-total fix.
--
-- Same formula as retailErpLinePrintPlan / RetailERPTemplate:
--   display rate = MRP when MRP > unit price, otherwise unit price
--   line gap     = max(0, round(display rate × qty − line_total, 2))
--   prop         = discount_amount + flat_discount_amount
--   computed     = max(0, sum(display gross) − (net_amount + sale_return_adjust − round_off))
--   Gurukrupa discount = computed (billed unit rate)
--   other family   discount = prop when > ₹0.005, else computed
--   pool         = max(0, round(discount − sum(line gaps), 2))
--
-- dust  = pool in (0.005, 1)     lines stop being shaved; paise move to
--                                Round Off or the Discount row
-- bill  = pool >= 1              lines stay shaved; page/sub totals change
--                                to the sum of those printed amounts
--
-- Does not update anything. Run in the SQL editor as postgres / service_role.
-- Anon RLS returns zero rows.

WITH org_tpl AS (
  SELECT
    st.organization_id,
    o.name AS org_name,
    NULLIF(st.sale_settings->>'invoice_template', '') AS sale_template,
    NULLIF(st.sale_settings->>'pos_invoice_template', '') AS pos_template
  FROM public.settings st
  JOIN public.organizations o ON o.id = st.organization_id
),
line_math AS (
  SELECT
    si.sale_id,
    SUM(
      (CASE
        WHEN COALESCE(si.mrp, 0) > 0 AND COALESCE(si.mrp, 0) > COALESCE(si.unit_price, 0)
          THEN si.mrp
        ELSE COALESCE(si.unit_price, 0)
      END) * COALESCE(si.quantity, 0)
    ) AS display_subtotal,
    SUM(
      GREATEST(
        0,
        ROUND(
          (
            (CASE
              WHEN COALESCE(si.mrp, 0) > 0 AND COALESCE(si.mrp, 0) > COALESCE(si.unit_price, 0)
                THEN si.mrp
              ELSE COALESCE(si.unit_price, 0)
            END) * COALESCE(si.quantity, 0)
            - COALESCE(si.line_total, 0)
          )::numeric,
          2
        )
      )
    ) AS line_gap_sum
  FROM public.sale_items si
  WHERE si.deleted_at IS NULL
  GROUP BY si.sale_id
),
scoped AS (
  SELECT
    s.id,
    s.organization_id,
    ot.org_name,
    s.sale_number,
    s.sale_type,
    s.is_cancelled,
    CASE
      WHEN s.sale_type = 'pos'
        THEN COALESCE(ot.pos_template, ot.sale_template)
      ELSE ot.sale_template
    END AS template,
    GREATEST(0, COALESCE(s.discount_amount, 0) + COALESCE(s.flat_discount_amount, 0)) AS prop_discount,
    GREATEST(
      0,
      COALESCE(lm.display_subtotal, 0)
        - (COALESCE(s.net_amount, 0) + COALESCE(s.sale_return_adjust, 0) - COALESCE(s.round_off, 0))
    ) AS computed_discount,
    COALESCE(lm.line_gap_sum, 0) AS line_gap_sum,
    s.discount_amount,
    s.flat_discount_amount,
    s.round_off,
    s.sale_return_adjust,
    s.gross_amount,
    s.net_amount
  FROM public.sales s
  JOIN org_tpl ot ON ot.organization_id = s.organization_id
  LEFT JOIN line_math lm ON lm.sale_id = s.id
  WHERE s.deleted_at IS NULL
),
pooled AS (
  SELECT
    *,
    CASE
      WHEN template = 'gurukrupa' THEN
        CASE WHEN computed_discount > 0.005 THEN computed_discount ELSE 0 END
      WHEN prop_discount > 0.005 THEN prop_discount
      WHEN computed_discount > 0.005 THEN computed_discount
      ELSE 0
    END AS display_discount
  FROM scoped
),
with_pool AS (
  SELECT
    *,
    GREATEST(0, ROUND((display_discount - line_gap_sum)::numeric, 2)) AS flat_discount_pool
  FROM pooled
)
SELECT
  org_name,
  organization_id,
  COALESCE(template, '(unset)') AS template,
  COUNT(*) FILTER (WHERE flat_discount_pool > 0.005 AND flat_discount_pool < 1) AS dust_pool_sales,
  COUNT(*) FILTER (WHERE flat_discount_pool >= 1) AS bill_pool_sales,
  COUNT(*) FILTER (WHERE flat_discount_pool > 0.005) AS any_pool_sales,
  ROUND(SUM(flat_discount_pool) FILTER (WHERE flat_discount_pool > 0.005 AND flat_discount_pool < 1), 2) AS dust_pool_rupees,
  ROUND(SUM(flat_discount_pool) FILTER (WHERE flat_discount_pool >= 1), 2) AS bill_pool_rupees
FROM with_pool
WHERE template IN (
  'real-tast',
  'retail-erp',
  'zaika',
  'gurukrupa',
  'retail-erp-preprinted',
  'retail-erp-dc'
)
GROUP BY org_name, organization_id, template
HAVING COUNT(*) FILTER (WHERE flat_discount_pool > 0.005) > 0
ORDER BY any_pool_sales DESC, org_name, template;
