-- Offer notifications (Send offer → push-send) insert push_campaigns.kind = 'offer', but the
-- live push_campaigns_kind_check (created outside this repo) does not list 'offer', so every
-- offer send fails with "violates check constraint push_campaigns_kind_check".
-- Recreate the check with every value it already allows plus 'offer'. Additive, idempotent:
-- if 'offer' is already allowed (or there is no such check) nothing changes.
DO $$
DECLARE
  v_def text;
  v_vals text[];
  v_list text;
BEGIN
  SELECT pg_get_constraintdef(c.oid) INTO v_def
  FROM pg_constraint c
  WHERE c.conrelid = 'public.push_campaigns'::regclass
    AND c.conname = 'push_campaigns_kind_check';

  IF v_def IS NULL OR v_def LIKE '%''offer''%' THEN
    RETURN;
  END IF;

  SELECT array_agg(DISTINCT m[1]) INTO v_vals
  FROM regexp_matches(v_def, '''([^'']+)''', 'g') AS m;

  v_vals := array_append(COALESCE(v_vals, ARRAY[]::text[]), 'offer');

  SELECT string_agg(quote_literal(v), ', ' ORDER BY v) INTO v_list
  FROM unnest(v_vals) AS v;

  ALTER TABLE public.push_campaigns DROP CONSTRAINT push_campaigns_kind_check;
  EXECUTE format(
    'ALTER TABLE public.push_campaigns ADD CONSTRAINT push_campaigns_kind_check CHECK (kind IN (%s))',
    v_list
  );
END $$;
