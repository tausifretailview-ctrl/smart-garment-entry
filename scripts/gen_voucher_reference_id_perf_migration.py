"""One-off generator for 20260920170000_voucher_reference_id_balance_perf.sql"""
from pathlib import Path

src = Path("supabase/migrations/20261219120000_fix_party_leftover_cn_refund_sign.sql").read_text(
    encoding="utf-8"
)

PAID_CTE_OLD = """  paid_at_sale_drift AS (
    SELECT
      sub.customer_id AS cust_id,
      COALESCE(SUM(sub.drift), 0)::numeric AS amt
    FROM (
      SELECT
        s.customer_id,
        GREATEST(
          0::numeric,
          GREATEST(COALESCE(s.cash_amount, 0), 0)
            + GREATEST(COALESCE(s.card_amount, 0), 0)
            + GREATEST(COALESCE(s.upi_amount, 0), 0)
          - COALESCE((
            SELECT SUM(
              GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
            )
            FROM public.voucher_entries ve
            WHERE ve.organization_id = p_organization_id
              AND ve.deleted_at IS NULL
              AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
              AND ve.reference_id::text = s.id::text
              AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
          ), 0)
        )::numeric AS drift
      FROM valid_sales s
      WHERE (
        GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      ) > 0.005
    ) sub
    WHERE sub.drift > 0
    GROUP BY sub.customer_id
  ),"""

PAID_CTE_NEW = """  sale_receipt_settlement AS (
    SELECT * FROM public._org_sale_receipt_settlement_by_sale(p_organization_id)
  ),
  sale_drift_rows AS (
    SELECT
      s.customer_id,
      GREATEST(
        0::numeric,
        GREATEST(COALESCE(s.cash_amount, 0), 0)
          + GREATEST(COALESCE(s.card_amount, 0), 0)
          + GREATEST(COALESCE(s.upi_amount, 0), 0)
        - COALESCE(srs.settled_amt, 0)
      )::numeric AS drift
    FROM valid_sales s
    LEFT JOIN sale_receipt_settlement srs ON srs.sale_id = s.id
    WHERE (
      GREATEST(COALESCE(s.cash_amount, 0), 0)
      + GREATEST(COALESCE(s.card_amount, 0), 0)
      + GREATEST(COALESCE(s.upi_amount, 0), 0)
    ) > 0.005
  ),
  paid_at_sale_drift AS (
    SELECT
      sdr.customer_id AS cust_id,
      COALESCE(SUM(sdr.drift), 0)::numeric AS amt
    FROM sale_drift_rows sdr
    WHERE sdr.drift > 0
    GROUP BY sdr.customer_id
  ),"""


def patch_receipt_base(sql: str) -> str:
    sql = sql.replace(
        """  receipt_voucher_base AS (
    SELECT
      trim(COALESCE(ve.reference_id::text, '')) AS ref_trim,
      lower(COALESCE(ve.reference_type, '')) AS ref_type,""",
        """  receipt_voucher_base AS (
    SELECT
      ve.reference_id AS ref_id,
      trim(COALESCE(ve.reference_id::text, '')) AS ref_trim,
      lower(COALESCE(ve.reference_type, '')) AS ref_type,""",
    )
    sql = sql.replace(
        "INNER JOIN org_sales_ref osr ON osr.ref_trim = rvb.ref_trim",
        "INNER JOIN org_sales_ref osr ON osr.sale_id = rvb.ref_id",
    )
    sql = sql.replace(
        "INNER JOIN cust c ON rvb.ref_trim = trim(c.id::text)",
        "INNER JOIN cust c ON c.id = rvb.ref_id",
    )
    sql = sql.replace(
        "SELECT 1 FROM org_sales_ref osr2 WHERE osr2.ref_trim = rvb.ref_trim",
        "SELECT 1 FROM org_sales_ref osr2 WHERE osr2.sale_id = rvb.ref_id",
    )
    return sql


# reconcile
r0 = src.index("CREATE OR REPLACE FUNCTION public.reconcile_customer_balance")
r1 = src.index("REVOKE ALL ON FUNCTION public.reconcile_customer_balance")
reconcile = src[r0:r1]
old_paid = """  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      - COALESCE((
        SELECT SUM(
          GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
        )
        FROM public.voucher_entries ve
        WHERE ve.organization_id = p_organization_id
          AND ve.deleted_at IS NULL
          AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
          AND ve.reference_id::text = s.id::text
          AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
      ), 0)
    ) AS drift
    FROM public.sales s"""
new_paid = """  FROM (
    SELECT GREATEST(
      0::numeric,
      GREATEST(COALESCE(s.cash_amount, 0), 0)
        + GREATEST(COALESCE(s.card_amount, 0), 0)
        + GREATEST(COALESCE(s.upi_amount, 0), 0)
      - COALESCE(srt.settled_amt, 0)
    ) AS drift
    FROM public.sales s
    LEFT JOIN public._org_sale_receipt_settlement_by_sale(p_organization_id) srt
      ON srt.sale_id = s.id"""
if old_paid not in reconcile:
    raise SystemExit("reconcile paid block not found")
reconcile = reconcile.replace(old_paid, new_paid)
reconcile = reconcile.replace("s.id::text = ve.reference_id::text", "s.id = ve.reference_id")
reconcile = reconcile.replace("s2.id::text = ve.reference_id::text", "s2.id = ve.reference_id")
reconcile = reconcile.replace(
    "AND trim(COALESCE(ve.reference_id::text, '')) = trim(p_customer_id::text)",
    "AND ve.reference_id = p_customer_id",
)

# party rows
p0 = src.index("CREATE OR REPLACE FUNCTION public._get_customer_party_balances_rows(p_organization_id uuid)")
p1 = src.index("COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid)")
party = src[p0:p1]
if PAID_CTE_OLD not in party:
    raise SystemExit("party paid cte not found")
party = party.replace(PAID_CTE_OLD, PAID_CTE_NEW, 1)
party = patch_receipt_base(party)
party = party.replace(
    "_get_customer_party_balances_rows(p_organization_id uuid)",
    "_get_customer_party_balances_rows(p_organization_id uuid, p_search text DEFAULT NULL)",
)
party = party.replace(
    """    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
  ),""",
    """    WHERE c.organization_id = p_organization_id
      AND c.deleted_at IS NULL
      AND (
        COALESCE(NULLIF(btrim(p_search), ''), '') = ''
        OR c.customer_name ILIKE '%' || btrim(p_search) || '%'
        OR COALESCE(c.phone, '') ILIKE '%' || btrim(p_search) || '%'
      )
  ),""",
)
party = party.replace(
    """      AND s.customer_id IS NOT NULL
  ),
  org_sales_ref AS (""",
    """      AND s.customer_id IS NOT NULL
      AND s.customer_id IN (SELECT id FROM cust)
  ),
  org_sales_ref AS (""",
    1,
)
party = party.replace(
    "COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid)",
    "COMMENT ON FUNCTION public._get_customer_party_balances_rows(uuid, text)",
)
party = party.replace(
    "REVOKE ALL ON FUNCTION public._get_customer_party_balances_rows(uuid)",
    "REVOKE ALL ON FUNCTION public._get_customer_party_balances_rows(uuid, text)",
)
party = party.replace(
    "GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid)",
    "GRANT EXECUTE ON FUNCTION public._get_customer_party_balances_rows(uuid, text)",
)
party = party.replace(
    "paid_at_sale_drift mirrors reconcile_customer_balance (memo-excluded receipt subquery).",
    "paid_at_sale_drift uses _org_sale_receipt_settlement_by_sale (index-friendly uuid join).",
)

# snapshot
s0 = src.index("CREATE OR REPLACE FUNCTION public.get_customer_financial_snapshot_all")
s1 = src.index("COMMENT ON FUNCTION public.get_customer_financial_snapshot_all")
snap = src[s0:s1]
if PAID_CTE_OLD not in snap:
    raise SystemExit("snapshot paid cte not found")
snap = snap.replace(PAID_CTE_OLD, PAID_CTE_NEW, 1)
snap = patch_receipt_base(snap)

header = """-- Perf: voucher_entries.reference_id uuid joins + one-pass sale receipt totals.
-- Step 1 diagnostics: scripts/diagnose-customer-party-balances-timeout.sql
-- Existing: idx_voucher_entries_org_type_ref (organization_id, voucher_type, reference_id).
-- Adds reference_id index; replaces paid_at_sale_drift correlated subqueries.
-- Replaces stale _get_customer_party_balances_rows(uuid,text) from 20260920113000 with
-- 202612 leftover-CN body + p_search + perf.

CREATE INDEX IF NOT EXISTS idx_voucher_entries_reference_id
  ON public.voucher_entries(reference_id)
  WHERE deleted_at IS NULL;

CREATE OR REPLACE FUNCTION public._org_sale_receipt_settlement_by_sale(p_organization_id uuid)
RETURNS TABLE (
  sale_id uuid,
  settled_amt numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT
    ve.reference_id AS sale_id,
    COALESCE(SUM(
      GREATEST(0::numeric, COALESCE(ve.total_amount, 0) + COALESCE(ve.discount_amount, 0))
    ), 0)::numeric AS settled_amt
  FROM public.voucher_entries ve
  WHERE ve.organization_id = p_organization_id
    AND ve.deleted_at IS NULL
    AND lower(COALESCE(ve.voucher_type, '')) = 'receipt'
    AND ve.reference_id IS NOT NULL
    AND NOT public._is_settlement_memo_receipt(ve.payment_method, ve.description)
  GROUP BY ve.reference_id;
$$;

COMMENT ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) IS
  'Per-sale receipt settlement totals (memo-excluded). Index-friendly reference_id uuid.';

REVOKE ALL ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public._org_sale_receipt_settlement_by_sale(uuid) TO authenticated, service_role;

DROP FUNCTION IF EXISTS public._get_customer_party_balances_rows(uuid);

"""

footer = """
DROP FUNCTION IF EXISTS public._get_customer_party_balances_rows(uuid);

"""

out = header + party + "\n" + reconcile + "\n" + snap + footer
Path("supabase/migrations/20260920170000_voucher_reference_id_balance_perf.sql").write_text(
    out, encoding="utf-8"
)
print("wrote", len(out), "chars")
