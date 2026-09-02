-- Phase 3: denormalize sale_items.organization_id and drive line-item search
-- from an org-scoped RPC (trigram + tenant predicate, no sale_id IN (...) ILIKE).
--
-- Backfill is batched. Trigger keeps the column in sync on INSERT and on
-- sale_id re-parenting (no app path updates sale_id post-insert; trigger still
-- handles it). Views/RLS unchanged.

-- ── 1. Column ───────────────────────────────────────────────────────────────
ALTER TABLE public.sale_items
  ADD COLUMN IF NOT EXISTS organization_id uuid;

-- ── 2. Batched backfill from parent sales ───────────────────────────────────
DO $$
DECLARE
  v_batch constant int := 5000;
  v_updated int;
  v_loops int := 0;
BEGIN
  LOOP
    WITH picked AS (
      SELECT si.id
      FROM public.sale_items si
      WHERE si.organization_id IS NULL
        AND EXISTS (SELECT 1 FROM public.sales s WHERE s.id = si.sale_id)
      ORDER BY si.id
      LIMIT v_batch
    )
    UPDATE public.sale_items si
    SET organization_id = s.organization_id
    FROM picked p
    INNER JOIN public.sales s ON s.id = si.sale_id
    WHERE si.id = p.id;

    GET DIAGNOSTICS v_updated = ROW_COUNT;
    EXIT WHEN v_updated = 0;
    v_loops := v_loops + 1;
    IF v_loops > 100000 THEN
      RAISE EXCEPTION 'sale_items.organization_id backfill exceeded loop cap';
    END IF;
  END LOOP;
END $$;

-- ── 3. Validate before NOT NULL / trigger ───────────────────────────────────
-- Every sale_items row must join its parent sale and carry that sale's org.
-- (Counts vs sales are 1:N; the invariant is match-all, zero nulls, zero drift.)
DO $$
DECLARE
  v_items bigint;
  v_sales_with_items bigint;
  v_matched bigint;
  v_nulls bigint;
  v_mismatch bigint;
  v_orphans bigint;
BEGIN
  SELECT COUNT(*) INTO v_items FROM public.sale_items;
  SELECT COUNT(DISTINCT sale_id) INTO v_sales_with_items FROM public.sale_items;
  SELECT COUNT(*) INTO v_matched
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE si.organization_id IS NOT DISTINCT FROM s.organization_id;
  SELECT COUNT(*) INTO v_nulls FROM public.sale_items WHERE organization_id IS NULL;
  SELECT COUNT(*) INTO v_mismatch
  FROM public.sale_items si
  INNER JOIN public.sales s ON s.id = si.sale_id
  WHERE si.organization_id IS DISTINCT FROM s.organization_id;
  SELECT COUNT(*) INTO v_orphans
  FROM public.sale_items si
  WHERE NOT EXISTS (SELECT 1 FROM public.sales s WHERE s.id = si.sale_id);

  RAISE NOTICE 'sale_items org backfill: items=% sales_with_items=% matched=% nulls=% mismatch=% orphans=%',
    v_items, v_sales_with_items, v_matched, v_nulls, v_mismatch, v_orphans;

  IF v_nulls <> 0 OR v_mismatch <> 0 OR v_orphans <> 0 OR v_matched <> v_items THEN
    RAISE EXCEPTION
      'sale_items.organization_id backfill failed (items=%, sales_with_items=%, matched=%, nulls=%, mismatch=%, orphans=%). Not applying NOT NULL / trigger.',
      v_items, v_sales_with_items, v_matched, v_nulls, v_mismatch, v_orphans;
  END IF;
END $$;

ALTER TABLE public.sale_items
  ALTER COLUMN organization_id SET NOT NULL;

ALTER TABLE public.sale_items
  DROP CONSTRAINT IF EXISTS sale_items_organization_id_fkey;
ALTER TABLE public.sale_items
  ADD CONSTRAINT sale_items_organization_id_fkey
  FOREIGN KEY (organization_id) REFERENCES public.organizations(id);

-- ── 4. Indexes (keep existing per-column trigrams; these add org scope) ─────
CREATE INDEX IF NOT EXISTS idx_sale_items_organization_id
  ON public.sale_items (organization_id)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_org_product_name_trgm
  ON public.sale_items USING gin (organization_id uuid_ops, product_name gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_org_barcode_trgm
  ON public.sale_items USING gin (organization_id uuid_ops, barcode gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_org_size_trgm
  ON public.sale_items USING gin (organization_id uuid_ops, size gin_trgm_ops)
  WHERE deleted_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_sale_items_org_color_trgm
  ON public.sale_items USING gin (organization_id uuid_ops, color gin_trgm_ops)
  WHERE deleted_at IS NULL;

-- ── 5. Sync trigger (INSERT + sale_id re-parent) ────────────────────────────
CREATE OR REPLACE FUNCTION public.sale_items_sync_organization_id()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
BEGIN
  IF TG_OP = 'INSERT' OR NEW.sale_id IS DISTINCT FROM OLD.sale_id THEN
    SELECT s.organization_id
      INTO NEW.organization_id
    FROM public.sales s
    WHERE s.id = NEW.sale_id;

    IF NEW.organization_id IS NULL THEN
      RAISE EXCEPTION 'sale_items.organization_id: parent sale % not found', NEW.sale_id
        USING ERRCODE = '23503';
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_sale_items_sync_organization_id ON public.sale_items;
CREATE TRIGGER trg_sale_items_sync_organization_id
  BEFORE INSERT OR UPDATE OF sale_id
  ON public.sale_items
  FOR EACH ROW
  EXECUTE FUNCTION public.sale_items_sync_organization_id();

REVOKE ALL ON FUNCTION public.sale_items_sync_organization_id() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.sale_items_sync_organization_id() FROM anon;
GRANT EXECUTE ON FUNCTION public.sale_items_sync_organization_id() TO authenticated, service_role;

COMMENT ON COLUMN public.sale_items.organization_id IS
  'Copied from sales.organization_id. Set by trg_sale_items_sync_organization_id on INSERT / sale_id change. Used to org-scope line-item search without a parent IN-list.';

-- ── 6. One org-scoped search RPC ────────────────────────────────────────────
-- Same UNION/LIMIT-per-column shape as search_invoice_sale_ids (20261111),
-- with si.organization_id = p_org_id so the org+trigram GIN can drive.
-- p_sale_types keeps POS vs invoice result sets from mixing.

CREATE OR REPLACE FUNCTION public.search_line_item_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 1000,
  p_sale_types text[] DEFAULT NULL
)
RETURNS TABLE(sale_id uuid)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_q text;
  v_limit int;
  v_branch_cap int;
BEGIN
  IF p_org_id IS NULL THEN
    RAISE EXCEPTION 'p_org_id is required';
  END IF;
  IF p_sale_types IS NULL OR cardinality(p_sale_types) = 0 THEN
    RAISE EXCEPTION 'p_sale_types is required';
  END IF;

  IF auth.role() = 'anon' THEN
    RAISE EXCEPTION 'Not authorized' USING ERRCODE = '42501';
  END IF;
  IF auth.role() = 'authenticated' AND NOT (p_org_id IN (SELECT public.get_user_organization_ids(auth.uid()))) THEN
    RAISE EXCEPTION 'Not authorized for this organization' USING ERRCODE = '42501';
  END IF;

  v_q := btrim(COALESCE(p_search, ''));
  IF v_q = '' THEN
    RETURN;
  END IF;

  v_limit := GREATEST(COALESCE(p_limit, 1000), 1);
  v_branch_cap := v_limit;

  RETURN QUERY
  SELECT u.sale_id
  FROM (
    (
      SELECT s.id AS sale_id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.product_name ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.barcode ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.size ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.sale_items si
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND si.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND si.color ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.products p
      INNER JOIN public.sale_items si ON si.product_id = p.id AND si.deleted_at IS NULL
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.style ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.products p
      INNER JOIN public.sale_items si ON si.product_id = p.id AND si.deleted_at IS NULL
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.category ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
    UNION
    (
      SELECT s.id
      FROM public.products p
      INNER JOIN public.sale_items si ON si.product_id = p.id AND si.deleted_at IS NULL
      INNER JOIN public.sales s ON s.id = si.sale_id
      WHERE si.organization_id = p_org_id
        AND p.organization_id = p_org_id
        AND p.deleted_at IS NULL
        AND s.organization_id = p_org_id
        AND s.sale_type = ANY (p_sale_types)
        AND s.deleted_at IS NULL
        AND (p_date_from IS NULL OR s.sale_date >= p_date_from)
        AND (p_date_to IS NULL OR s.sale_date <= p_date_to)
        AND p.brand ILIKE '%' || v_q || '%'
      LIMIT v_branch_cap
    )
  ) u
  LIMIT v_limit;
END;
$$;

COMMENT ON FUNCTION public.search_line_item_sale_ids(uuid, text, date, date, int, text[]) IS
  'Org-scoped line-item sale ids (POS + invoice). Per-column trigram ILIKE unions with si.organization_id = p_org_id and sale_type = ANY(p_sale_types). SECURITY DEFINER, fail-closed auth.role() guard.';

REVOKE ALL ON FUNCTION public.search_line_item_sale_ids(uuid, text, date, date, int, text[]) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_line_item_sale_ids(uuid, text, date, date, int, text[]) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_line_item_sale_ids(uuid, text, date, date, int, text[]) TO authenticated, service_role;

-- Keep previous RPC names as thin wrappers so command palette / any missed
-- caller stays on the same signature. Guard lives in the shared function.
CREATE OR REPLACE FUNCTION public.search_invoice_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 1000
)
RETURNS TABLE(sale_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.sale_id
  FROM public.search_line_item_sale_ids(
    p_org_id, p_search, p_date_from, p_date_to, p_limit, ARRAY['invoice']::text[]
  ) s;
$$;

CREATE OR REPLACE FUNCTION public.search_pos_sale_ids(
  p_org_id uuid,
  p_search text,
  p_date_from date DEFAULT NULL,
  p_date_to date DEFAULT NULL,
  p_limit int DEFAULT 1000
)
RETURNS TABLE(sale_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
  SELECT s.sale_id
  FROM public.search_line_item_sale_ids(
    p_org_id, p_search, p_date_from, p_date_to, p_limit,
    ARRAY['pos', 'delivery_challan']::text[]
  ) s;
$$;

REVOKE ALL ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_invoice_sale_ids(uuid, text, date, date, int) TO authenticated, service_role;

REVOKE ALL ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, int) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, int) FROM anon;
GRANT EXECUTE ON FUNCTION public.search_pos_sale_ids(uuid, text, date, date, int) TO authenticated, service_role;
