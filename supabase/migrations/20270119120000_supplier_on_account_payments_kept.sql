-- Supplier balances SQL: keep genuine on-account / opening-balance payments (Lovable scan 2026-10-10).
--
-- _get_supplier_party_balances_rows (20261102120000) added supplier-id payment vouchers only for the
-- slice not already covered by bill cash:  settled + GREATEST(0, on_account - GREATEST(0, settled - voucher_total)).
-- So cash paid at purchase time (bill paid_amount, no voucher) absorbed a real on-account payment:
-- a Rs 5,000 on-account payment to a supplier whose bills were paid in cash at entry still showed as owing.
--
-- Fix, mirroring computeSupplierTotalPaid / supplierLevelVoucherDuplicatesBillCash (supplierBalanceUtils.ts):
--   total_paid = bill settled + supplier-id vouchers in full,
--   except the legacy duplicates of bill cash: description 'Payment at purchase', '^Payment for Bills:',
--   or 'Payment for Bill' naming one of that supplier's bill numbers.
--
-- Patches the LIVE definition with exact text replace (pg_get_functiondef -> replace -> EXECUTE), so other
-- production edits are kept. Raises (and changes nothing) if the expected text is not there.
-- The Supplier Balances / Ledger screens already use the JS rule; this aligns the SQL RPC with them.

DO $sup$
DECLARE
  v_def text;
  v_new text;
  v_old_slp constant text :=
'  supplier_level_payments AS (
    SELECT
      s.id AS supplier_id,
      ROUND(COALESCE(SUM(pv.settlement), 0)::numeric, 2) AS amt
    FROM sup s
    INNER JOIN payment_vouchers pv ON pv.ref_trim = trim(s.id::text)
    GROUP BY s.id
  ),';
  v_new_slp constant text :=
'  supplier_level_payments AS (
    SELECT
      s.id AS supplier_id,
      ROUND(COALESCE(SUM(pv.settlement), 0)::numeric, 2) AS amt
    FROM sup s
    INNER JOIN payment_vouchers pv ON pv.ref_trim = trim(s.id::text)
    WHERE NOT (
      trim(pv.description) = ''Payment at purchase''
      OR trim(pv.description) ~* ''^Payment for Bills:''
      OR (
        pv.description ~* ''Payment for Bill''
        AND EXISTS (
          SELECT 1
          FROM org_bills ob
          WHERE ob.supplier_id = s.id
            AND (
              (ob.software_bill_no IS NOT NULL AND strpos(pv.description, ob.software_bill_no) > 0)
              OR (ob.supplier_invoice_no IS NOT NULL AND strpos(pv.description, ob.supplier_invoice_no) > 0)
            )
        )
      )
    )
    GROUP BY s.id
  ),';
  v_old_paid constant text :=
'        COALESCE(bs.settled, 0)
        + GREATEST(
            0::numeric,
            COALESCE(slp.amt, 0)
            - GREATEST(0::numeric, COALESCE(bs.settled, 0) - COALESCE(bs.voucher_total, 0))
          )';
  v_new_paid constant text :=
'        COALESCE(bs.settled, 0)
        + COALESCE(slp.amt, 0) /* supplier-on-account-v2 */';
BEGIN
  v_def := pg_get_functiondef('public._get_supplier_party_balances_rows(uuid)'::regprocedure);
  IF strpos(v_def, 'supplier-on-account-v2') > 0 THEN
    RAISE NOTICE 'supplier-on-account-v2: already applied';
    RETURN;
  END IF;
  IF strpos(v_def, v_old_slp) = 0 OR strpos(v_def, v_old_paid) = 0 THEN
    RAISE EXCEPTION 'supplier-on-account-v2: expected text not found in _get_supplier_party_balances_rows';
  END IF;
  v_new := replace(replace(v_def, v_old_slp, v_new_slp), v_old_paid, v_new_paid);
  EXECUTE v_new;
  RAISE NOTICE 'supplier-on-account-v2: patched';
END
$sup$;
