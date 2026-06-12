-- Supplier invoice number helpers: series-wise peek + atomic allocate per organization.
-- Safe when multiple users create purchase bills at the same time.

CREATE OR REPLACE FUNCTION public._increment_supplier_invoice_no(prev text)
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public
AS $$
DECLARE
  t text := trim(coalesce(prev, ''));
  m text[];
  segs text[];
  i int;
  num_str text;
  next_num bigint;
  padded text;
BEGIN
  IF t = '' THEN
    RETURN '1';
  END IF;

  IF t ~ '^\d+$' THEN
    RETURN (t::bigint + 1)::text;
  END IF;

  m := regexp_match(t, '^(.*)(\d+)$');
  IF m IS NOT NULL THEN
    next_num := m[2]::bigint + 1;
    padded := lpad(next_num::text, length(m[2]), '0');
    RETURN m[1] || padded;
  END IF;

  segs := regexp_split_to_array(t, '([/\-])');
  IF segs IS NOT NULL THEN
    FOR i IN REVERSE array_lower(segs, 1)..array_upper(segs, 1) LOOP
      IF segs[i] ~ '^\d+$' THEN
        num_str := segs[i];
        next_num := num_str::bigint + 1;
        padded := lpad(next_num::text, length(num_str), '0');
        segs[i] := padded;
        RETURN array_to_string(segs, '');
      END IF;
    END LOOP;
  END IF;

  RETURN '1';
END;
$$;

CREATE OR REPLACE FUNCTION public._supplier_invoice_serial_parts(
  inv text,
  OUT prefix text,
  OUT num bigint,
  OUT num_str text
)
LANGUAGE plpgsql
IMMUTABLE
SET search_path TO public
AS $$
DECLARE
  t text := trim(coalesce(inv, ''));
  m text[];
  segs text[];
  i int;
BEGIN
  prefix := NULL;
  num := NULL;
  num_str := NULL;
  IF t = '' THEN
    RETURN;
  END IF;

  IF t ~ '^\d+$' THEN
    prefix := '';
    num_str := t;
    num := t::bigint;
    RETURN;
  END IF;

  m := regexp_match(t, '^(.*)(\d+)$');
  IF m IS NOT NULL THEN
    prefix := m[1];
    num_str := m[2];
    num := m[2]::bigint;
    RETURN;
  END IF;

  segs := regexp_split_to_array(t, '([/\-])');
  IF segs IS NOT NULL THEN
    FOR i IN REVERSE array_lower(segs, 1)..array_upper(segs, 1) LOOP
      IF segs[i] ~ '^\d+$' THEN
        prefix := array_to_string(segs[1:i - 1], '');
        num_str := segs[i];
        num := segs[i]::bigint;
        RETURN;
      END IF;
    END LOOP;
  END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public._next_supplier_invoice_in_series(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  ref_inv text;
  ref_prefix text;
  ref_num bigint;
  ref_num_str text;
  best_num bigint := NULL;
  best_num_str text;
  best_prefix text;
  r record;
  parts record;
BEGIN
  SELECT supplier_invoice_no
  INTO ref_inv
  FROM purchase_bills
  WHERE organization_id = p_organization_id
    AND deleted_at IS NULL
    AND (is_cancelled IS NULL OR is_cancelled = false)
    AND supplier_invoice_no IS NOT NULL
    AND trim(supplier_invoice_no) <> ''
  ORDER BY created_at DESC
  LIMIT 1;

  IF ref_inv IS NULL THEN
    RETURN '1';
  END IF;

  SELECT * INTO parts FROM public._supplier_invoice_serial_parts(ref_inv);
  ref_prefix := parts.prefix;
  ref_num := parts.num;
  ref_num_str := parts.num_str;

  IF ref_num IS NULL THEN
    RETURN public._increment_supplier_invoice_no(ref_inv);
  END IF;

  best_prefix := ref_prefix;
  best_num := ref_num;
  best_num_str := ref_num_str;

  FOR r IN
    SELECT supplier_invoice_no AS inv
    FROM purchase_bills
    WHERE organization_id = p_organization_id
      AND deleted_at IS NULL
      AND (is_cancelled IS NULL OR is_cancelled = false)
      AND supplier_invoice_no IS NOT NULL
      AND trim(supplier_invoice_no) <> ''
  LOOP
    SELECT * INTO parts FROM public._supplier_invoice_serial_parts(r.inv);
    IF parts.num IS NOT NULL AND parts.prefix = ref_prefix AND parts.num > best_num THEN
      best_num := parts.num;
      best_num_str := parts.num_str;
    END IF;
  END LOOP;

  RETURN public._increment_supplier_invoice_no(best_prefix || best_num_str);
END;
$$;

CREATE OR REPLACE FUNCTION public.peek_next_supplier_invoice_number(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
BEGIN
  RETURN public._next_supplier_invoice_in_series(p_organization_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.allocate_supplier_invoice_number(
  p_organization_id uuid,
  p_supplier_id uuid
)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO public
AS $$
DECLARE
  lock_key bigint;
  candidate text;
  attempt int := 0;
BEGIN
  IF p_organization_id IS NULL OR p_supplier_id IS NULL THEN
    RAISE EXCEPTION 'organization_id and supplier_id are required';
  END IF;

  lock_key := hashtextextended(p_organization_id::text, 0);
  PERFORM pg_advisory_xact_lock(lock_key);

  candidate := public._next_supplier_invoice_in_series(p_organization_id);

  LOOP
    EXIT WHEN attempt >= 100;

    IF NOT EXISTS (
      SELECT 1
      FROM purchase_bills
      WHERE organization_id = p_organization_id
        AND supplier_id = p_supplier_id
        AND deleted_at IS NULL
        AND (is_cancelled IS NULL OR is_cancelled = false)
        AND supplier_invoice_no = candidate
    ) THEN
      RETURN candidate;
    END IF;

    candidate := public._increment_supplier_invoice_no(candidate);
    attempt := attempt + 1;
  END LOOP;

  RETURN candidate;
END;
$$;

GRANT EXECUTE ON FUNCTION public.peek_next_supplier_invoice_number(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.allocate_supplier_invoice_number(uuid, uuid) TO authenticated;
