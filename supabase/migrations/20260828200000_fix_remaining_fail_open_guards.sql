-- P0 SECURITY follow-up: close the 9 read functions that 20260828190100 deliberately
-- skipped because their guard did not match the recognised shape.
--
-- Live triage (definitions read off production 2026-08-29):
--
-- ALREADY FAIL-CLOSED - intentionally NOT touched (2)
--   get_customer_ledger_anomalies()      - `authz` CTE requires platform_admin and is
--                                          consumed as `FROM authz, orgs o`; for anon the
--                                          CTE is empty so the cross join yields 0 rows.
--   get_wappconnect_instance_masked(uuid)- opens with
--                                          `IF auth.uid() IS NULL THEN RETURN NULL; END IF;`
--
-- FAIL-OPEN, plpgsql, fixed by PREPEND (2)
--   detect_balance_adjustment_drift(uuid,numeric)
--       `IF auth.uid() IS NOT NULL AND NOT EXISTS (...) THEN RAISE` - the AND short-circuits
--       to false for anon, so the RAISE never fires. Not matched by the previous migration
--       because `THEN` does not follow `NULL` directly.
--   compute_sale_settlement_v2(uuid,uuid)
--       no authorization check of any kind.
--
-- FAIL-OPEN, LANGUAGE sql, fixed by WHERE PREDICATE (5)
--   A `LANGUAGE sql` body cannot contain an IF statement, and rewriting these to plpgsql
--   would break SQL inlining and risk a performance regression on stock reports. They get
--   `auth.role() IS DISTINCT FROM 'anon'` instead, which is:
--       authenticated -> true (unchanged) | service_role -> true (unchanged)
--       NULL in-db caller -> true (unchanged, IS DISTINCT FROM is NULL-safe) | anon -> false
--   get_stock_at_time / get_stock_at_time_batch / get_sale_items_gross_batch
--       take variant / sale ids and have NO org parameter, so there is no membership check
--       to perform even in principle; anon simply gets nothing.
--   _zero_unscanned_candidates(uuid,uuid,uuid[])
--   detect_orphan_purchase_stock(uuid)
--       WORST OF THE NINE: its guard reads
--           (auth.uid() IS NULL OR sm.organization_id IN (SELECT get_user_organization_ids(...)))
--       and p_organization_id DEFAULTs to NULL, so an anonymous caller would receive orphan
--       stock rows for EVERY organization. The service_role / pg_cron "see all orgs" branch
--       is preserved exactly; only anon is excluded.
--
-- No behaviour change for authenticated users, service_role, or in-database callers.

-- ---------------------------------------------------------------------------
-- Part A - plpgsql: prepend the anon rejection after the outer BEGIN.
-- Body is otherwise untouched, so the authenticated path stays byte-identical.
-- ---------------------------------------------------------------------------
DO $outer$
DECLARE
  guard CONSTANT text :=
    '  IF auth.role() = ''anon'' THEN RAISE EXCEPTION ''Not authorized for this organization'' USING ERRCODE = ''42501''; END IF;';
  r record;
  v_def text;
  v_new text;
  n_fixed int := 0;
  n_skip  int := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    JOIN pg_language  l   ON l.oid = p.prolang
    WHERE nsp.nspname = 'public'
      AND p.prosecdef
      AND l.lanname = 'plpgsql'
      AND p.proname IN ('detect_balance_adjustment_drift', 'compute_sale_settlement_v2')
    ORDER BY 2
  LOOP
    v_def := pg_get_functiondef(r.oid);

    IF v_def ~ 'auth\.role\(\)\s*=\s*''anon''' THEN
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    -- First standalone BEGIN is the outer block; DECLARE sections precede it.
    -- chr(10) is used deliberately: E'\\n' inside a dollar-quoted body yields a LITERAL
    -- backslash-n, which corrupts the rewritten definition.
    v_new := regexp_replace(
      v_def,
      chr(10) || 'BEGIN' || chr(10),
      chr(10) || 'BEGIN' || chr(10) || guard || chr(10)
    );

    IF v_new = v_def THEN
      RAISE WARNING 'remaining fail-open fix SKIPPED (no outer BEGIN found): %', r.sig;
      n_skip := n_skip + 1;
      CONTINUE;
    END IF;

    EXECUTE v_new;
    n_fixed := n_fixed + 1;
  END LOOP;

  RAISE NOTICE 'part A (plpgsql prepend): % fixed, % skipped', n_fixed, n_skip;
END $outer$;

-- ---------------------------------------------------------------------------
-- Part B - LANGUAGE sql: bodies reproduced verbatim from live definitions with a
-- single anon predicate added. Nothing else changed.
-- ---------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION public.get_stock_at_time(
  p_variant_id uuid,
  p_timestamp timestamp with time zone
)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT (
    COALESCE(pv.opening_qty, 0) +
    COALESCE((
      SELECT SUM(sm.quantity)::integer
      FROM stock_movements sm
      WHERE sm.variant_id = p_variant_id
        AND sm.created_at <= p_timestamp
        AND sm.movement_type <> 'reconciliation'
    ), 0)
  )
  FROM product_variants pv
  WHERE pv.id = p_variant_id
    AND auth.role() IS DISTINCT FROM 'anon';
$function$;

CREATE OR REPLACE FUNCTION public.get_stock_at_time_batch(
  p_variant_ids uuid[],
  p_timestamp timestamp with time zone
)
RETURNS TABLE(variant_id uuid, stock_at_time integer)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pv.id AS variant_id,
    (
      COALESCE(pv.opening_qty, 0) +
      COALESCE((
        SELECT SUM(sm.quantity)::integer
        FROM stock_movements sm
        WHERE sm.variant_id = pv.id
          AND sm.created_at <= p_timestamp
          AND sm.movement_type <> 'reconciliation'
      ), 0)
    ) AS stock_at_time
  FROM product_variants pv
  WHERE pv.id = ANY(p_variant_ids)
    AND auth.role() IS DISTINCT FROM 'anon';
$function$;

CREATE OR REPLACE FUNCTION public.get_sale_items_gross_batch(p_sale_ids uuid[])
RETURNS TABLE(sale_id uuid, items_gross numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    si.sale_id,
    SUM(
      COALESCE(
        NULLIF(si.line_total, 0),
        COALESCE(si.unit_price, 0) * COALESCE(si.quantity, 0),
        COALESCE(si.mrp, 0) * COALESCE(si.quantity, 0)
      )
    )::numeric AS items_gross
  FROM public.sale_items si
  WHERE si.sale_id = ANY (COALESCE(p_sale_ids, ARRAY[]::uuid[]))
    AND si.deleted_at IS NULL
    AND auth.role() IS DISTINCT FROM 'anon'
  GROUP BY si.sale_id;
$function$;

CREATE OR REPLACE FUNCTION public._zero_unscanned_candidates(
  p_organization_id uuid,
  p_session_id uuid,
  p_exclude_variant_ids uuid[] DEFAULT '{}'::uuid[]
)
RETURNS TABLE(variant_id uuid, prior_qty integer, pur_price numeric)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT
    pv.id AS variant_id,
    GREATEST(0, COALESCE(pv.stock_qty, 0))::integer AS prior_qty,
    COALESCE(pv.pur_price, p.default_pur_price, 0)::numeric AS pur_price
  FROM public.product_variants pv
  INNER JOIN public.products p ON p.id = pv.product_id
  WHERE pv.organization_id = p_organization_id
    AND auth.role() IS DISTINCT FROM 'anon'
    AND pv.deleted_at IS NULL
    AND p.deleted_at IS NULL
    AND pv.active = true
    AND COALESCE(p.product_type, '') <> 'service'
    AND COALESCE(pv.stock_qty, 0) > 0
    AND NOT EXISTS (
      SELECT 1
      FROM public.stock_settlement_scans s
      WHERE s.organization_id = p_organization_id
        AND s.settlement_session_id = p_session_id
        AND s.variant_id = pv.id
    )
    AND (
      p_exclude_variant_ids IS NULL
      OR cardinality(p_exclude_variant_ids) = 0
      OR pv.id <> ALL (p_exclude_variant_ids)
    );
$function$;

-- Only the auth branch changes: anon can no longer fall into the "see every org" path
-- that service_role / pg_cron legitimately use.
CREATE OR REPLACE FUNCTION public.detect_orphan_purchase_stock(
  p_organization_id uuid DEFAULT NULL::uuid
)
RETURNS TABLE(
  organization_id uuid,
  reference_id uuid,
  bill_number text,
  movements bigint,
  net_qty numeric
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public', 'pg_temp'
AS $function$
  SELECT
    sm.organization_id,
    sm.reference_id,
    max(sm.bill_number) AS bill_number,
    count(*)::bigint AS movements,
    sum(sm.quantity)::numeric AS net_qty
  FROM public.stock_movements sm
  WHERE sm.deleted_at IS NULL
    AND sm.reference_id IS NOT NULL
    AND sm.movement_type IN (
      'purchase',
      'purchase_delete',
      'soft_delete_purchase',
      'purchase_increase',
      'purchase_decrease'
    )
    AND (p_organization_id IS NULL OR sm.organization_id = p_organization_id)
    AND auth.role() IS DISTINCT FROM 'anon'
    AND (
      auth.uid() IS NULL
      OR sm.organization_id IN (SELECT public.get_user_organization_ids(auth.uid()))
    )
    AND NOT EXISTS (
      SELECT 1
      FROM public.purchase_bills pb
      WHERE pb.id = sm.reference_id
    )
  GROUP BY sm.organization_id, sm.reference_id
  HAVING sum(sm.quantity) > 0.001
  ORDER BY sum(sm.quantity) DESC, max(sm.bill_number);
$function$;

-- ---------------------------------------------------------------------------
-- Part C - re-assert grants (the event trigger fired on every function above).
-- ---------------------------------------------------------------------------
DO $outer$
DECLARE
  r record;
  n int := 0;
BEGIN
  FOR r IN
    SELECT p.oid::regprocedure AS sig
    FROM pg_proc p
    JOIN pg_namespace nsp ON nsp.oid = p.pronamespace
    WHERE nsp.nspname = 'public'
      AND pg_get_function_result(p.oid) <> 'trigger'
      AND p.proname IN (
        'get_stock_at_time','get_stock_at_time_batch','get_sale_items_gross_batch',
        '_zero_unscanned_candidates','detect_orphan_purchase_stock',
        'detect_balance_adjustment_drift','compute_sale_settlement_v2'
      )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC, anon;', r.sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated, service_role;', r.sig);
    n := n + 1;
  END LOOP;
  RAISE NOTICE 'grants re-asserted on % function(s)', n;
END $outer$;
