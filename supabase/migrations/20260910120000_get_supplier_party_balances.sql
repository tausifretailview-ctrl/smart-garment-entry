-- Set-based supplier party balance list (Tally-style payables list).
-- Mirrors computeSnapshotForSupplier in src/utils/supplierBalanceUtils.ts EXACTLY:
--   balance = opening + purchases - paid - totalCreditNotesNet - unreflectedReturns - refundsReceived
-- CN netting: supplier-level credit_note vouchers minus amounts already in bill paid via
--   purchase_returns credit_status='adjusted' + linked_bill_id (SCN-00001 / SRK TELELINK rule).
--
-- Parity gate org (ELLA NOOR): 3fdca631-1e0c-4417-9704-421f5129ff67

CREATE OR REPLACE FUNCTION public._get_supplier_party_balances_rows(p_organization_id uuid)
RETURNS TABLE (
  out_supplier_id uuid,
  out_supplier_name text,
  out_signed_balance numeric,
  out_direction text,
  out_total_cr numeric,
  out_total_dr numeric,
  out_net_payable numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  WITH
  sup AS (
    SELECT
      s.id,
      s.supplier_name,
      COALESCE(s.opening_balance, 0)::numeric AS opening_balance
    FROM public.suppliers s
    WHERE s.organization_id = p_organization_id
      AND s.deleted_at IS NULL
  ),
  org_bills AS (
    SELECT
      pb.id,
      pb.supplier_id,
      COALESCE(pb.net_amount, 0)::numeric AS net_amount,
      COALESCE(pb.paid_amount, 0)::numeric AS paid_amount,
      NULLIF(trim(COALESCE(pb.software_bill_no, '')), '') AS software_bill_no,
      NULLIF(trim(COALESCE(pb.supplier_invoice_no, '')), '') AS supplier_invoice_no
    FROM public.purchase_bills pb
    WHERE pb.organization_id = p_organization_id
      AND pb.deleted_at IS NULL
      AND (pb.is_cancelled IS NULL OR pb.is_cancelled = false)
      AND pb.supplier_id IS NOT NULL
  ),
  total_purchases AS (
    SELECT
      ob.supplier_id,
      ROUND(COALESCE(SUM(ob.net_amount), 0)::numeric, 2) AS amt
    FROM org_bills ob
    GROUP BY ob.supplier_id
  ),
  payment_vouchers AS (
    SELECT
      trim(COALESCE(ve.reference_id::text, '')) AS ref_trim,
      COALESCE(ve.description, '') AS description,
      GREATEST(
        0::numeric,
        COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0)
      )::numeric AS settlement
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'payment'
      AND lower(COALESCE(ve.reference_type, '')) IN (
        'supplier', 'supplierpayment', 'supplier_payment', 'purchase'
      )
      AND trim(COALESCE(ve.reference_id::text, '')) <> ''
  ),
  per_bill_voucher_paid AS (
    SELECT
      ob.id AS bill_id,
      COALESCE(SUM(pv.settlement), 0)::numeric AS voucher_paid
    FROM org_bills ob
    INNER JOIN payment_vouchers pv ON pv.ref_trim = trim(ob.id::text)
    GROUP BY ob.id
  ),
  bill_paid_by_supplier AS (
    SELECT
      ob.supplier_id,
      ROUND(COALESCE(SUM(
        CASE
          WHEN COALESCE(pbv.voucher_paid, 0) > 0 THEN pbv.voucher_paid
          ELSE ob.paid_amount
        END
      ), 0)::numeric, 2) AS amt
    FROM org_bills ob
    LEFT JOIN per_bill_voucher_paid pbv ON pbv.bill_id = ob.id
    GROUP BY ob.supplier_id
  ),
  supplier_level_payments AS (
    SELECT
      s.id AS supplier_id,
      ROUND(COALESCE(SUM(pv.settlement), 0)::numeric, 2) AS amt
    FROM sup s
    INNER JOIN payment_vouchers pv ON pv.ref_trim = trim(s.id::text)
    WHERE NOT EXISTS (
      SELECT 1
      FROM org_bills ob
      WHERE ob.supplier_id = s.id
        AND (
          (
            ob.software_bill_no IS NOT NULL
            AND POSITION(ob.software_bill_no IN pv.description) > 0
          )
          OR (
            ob.supplier_invoice_no IS NOT NULL
            AND POSITION(ob.supplier_invoice_no IN pv.description) > 0
          )
        )
    )
    GROUP BY s.id
  ),
  total_paid AS (
    SELECT
      COALESCE(bp.supplier_id, slp.supplier_id) AS supplier_id,
      ROUND(
        (COALESCE(bp.amt, 0) + COALESCE(slp.amt, 0))::numeric,
        2
      ) AS amt
    FROM bill_paid_by_supplier bp
    FULL OUTER JOIN supplier_level_payments slp ON slp.supplier_id = bp.supplier_id
  ),
  credit_note_vouchers AS (
    SELECT
      ve.id,
      trim(COALESCE(ve.reference_id::text, '')) AS supplier_ref_trim,
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0))::numeric AS cn_amount
    FROM public.voucher_entries ve
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'credit_note'
      AND lower(COALESCE(ve.reference_type, '')) IN (
        'supplier', 'supplierpayment', 'supplier_payment', 'purchase'
      )
  ),
  cn_gross_by_supplier AS (
    SELECT
      s.id AS supplier_id,
      COALESCE(SUM(cn.cn_amount), 0)::numeric AS amt
    FROM sup s
    INNER JOIN credit_note_vouchers cn ON cn.supplier_ref_trim = trim(s.id::text)
    GROUP BY s.id
  ),
  cn_applied_to_bills AS (
    SELECT
      pr.supplier_id,
      COALESCE(SUM(
        CASE
          WHEN pr.credit_available_balance IS NULL THEN cn.cn_amount
          ELSE GREATEST(0::numeric, cn.cn_amount - COALESCE(pr.credit_available_balance, 0)::numeric)
        END
      ), 0)::numeric AS amt
    FROM public.purchase_returns pr
    INNER JOIN credit_note_vouchers cn ON cn.id = pr.credit_note_id
    WHERE pr.organization_id = p_organization_id
      AND pr.deleted_at IS NULL
      AND pr.supplier_id IS NOT NULL
      AND lower(trim(COALESCE(pr.credit_status, ''))) = 'adjusted'
      AND pr.linked_bill_id IS NOT NULL
      AND pr.credit_note_id IS NOT NULL
    GROUP BY pr.supplier_id
  ),
  total_credit_notes_net AS (
    SELECT
      COALESCE(g.supplier_id, a.supplier_id) AS supplier_id,
      ROUND(
        GREATEST(
          0::numeric,
          COALESCE(g.amt, 0) - COALESCE(a.amt, 0)
        )::numeric,
        2
      ) AS amt
    FROM cn_gross_by_supplier g
    FULL OUTER JOIN cn_applied_to_bills a ON a.supplier_id = g.supplier_id
  ),
  unreflected_returns AS (
    SELECT
      pr.supplier_id,
      ROUND(COALESCE(SUM(COALESCE(pr.net_amount, 0)), 0)::numeric, 2) AS amt
    FROM public.purchase_returns pr
    WHERE pr.organization_id = p_organization_id
      AND pr.deleted_at IS NULL
      AND pr.supplier_id IS NOT NULL
      AND (
        pr.credit_note_id IS NULL
        OR NOT EXISTS (
          SELECT 1 FROM credit_note_vouchers cn WHERE cn.id = pr.credit_note_id
        )
      )
      AND lower(trim(COALESCE(pr.credit_status, ''))) IN (
        'adjusted', 'adjusted_outstanding', 'refunded'
      )
    GROUP BY pr.supplier_id
  ),
  refunds_received AS (
    SELECT
      s.id AS supplier_id,
      ROUND(COALESCE(SUM(GREATEST(0::numeric, COALESCE(ve.total_amount, 0))), 0)::numeric, 2) AS amt
    FROM sup s
    INNER JOIN public.voucher_entries ve
      ON trim(COALESCE(ve.reference_id::text, '')) = trim(s.id::text)
    WHERE ve.organization_id = p_organization_id
      AND ve.deleted_at IS NULL
      AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
      AND lower(COALESCE(ve.reference_type, '')) IN (
        'supplier', 'supplierpayment', 'supplier_payment', 'purchase'
      )
    GROUP BY s.id
  ),
  balances AS (
    SELECT
      s.id AS supplier_id,
      s.supplier_name,
      ROUND((
        ROUND(s.opening_balance::numeric, 2)
        + COALESCE(tp.amt, 0)
        - COALESCE(tpd.amt, 0)
        - COALESCE(tcn.amt, 0)
        - COALESCE(ur.amt, 0)
        - COALESCE(rr.amt, 0)
      )::numeric, 2) AS bal_signed
    FROM sup s
    LEFT JOIN total_purchases tp ON tp.supplier_id = s.id
    LEFT JOIN total_paid tpd ON tpd.supplier_id = s.id
    LEFT JOIN total_credit_notes_net tcn ON tcn.supplier_id = s.id
    LEFT JOIN unreflected_returns ur ON ur.supplier_id = s.id
    LEFT JOIN refunds_received rr ON rr.supplier_id = s.id
  ),
  with_facets AS (
    SELECT
      b.supplier_id,
      b.supplier_name,
      b.bal_signed,
      CASE
        WHEN b.bal_signed > 0.5 THEN 'Cr'
        WHEN b.bal_signed < -0.5 THEN 'Dr'
        ELSE 'Settled'
      END AS dir_label
    FROM balances b
  )
  SELECT
    wf.supplier_id,
    wf.supplier_name,
    wf.bal_signed,
    wf.dir_label,
    ROUND(COALESCE(SUM(GREATEST(wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(GREATEST(-wf.bal_signed, 0)) OVER (), 0)::numeric, 2),
    ROUND(COALESCE(SUM(wf.bal_signed) OVER (), 0)::numeric, 2)
  FROM with_facets wf
  ORDER BY wf.supplier_name;
$$;

CREATE OR REPLACE FUNCTION public.get_supplier_party_balances(p_organization_id uuid)
RETURNS TABLE (
  supplier_id uuid,
  supplier_name text,
  signed_balance numeric,
  direction text,
  total_cr numeric,
  total_dr numeric,
  net_payable numeric
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF auth.uid() IS NOT NULL THEN
    IF p_organization_id IS NULL
       OR NOT (p_organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
      RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
    END IF;
  END IF;

  RETURN QUERY
  SELECT
    r.out_supplier_id,
    r.out_supplier_name,
    r.out_signed_balance,
    r.out_direction,
    r.out_total_cr,
    r.out_total_dr,
    r.out_net_payable
  FROM public._get_supplier_party_balances_rows(p_organization_id) AS r;
END;
$$;

COMMENT ON FUNCTION public._get_supplier_party_balances_rows(uuid) IS
  'Internal set-based supplier balance rows. Mirrors computeSnapshotForSupplier (supplierBalanceUtils.ts).';

COMMENT ON FUNCTION public.get_supplier_party_balances(uuid) IS
  'Tally-style supplier balance list. signed_balance = Supplier Ledger / payment tab balance. Positive = Cr (payable).';

GRANT EXECUTE ON FUNCTION public._get_supplier_party_balances_rows(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_supplier_party_balances(uuid) TO authenticated, service_role;
