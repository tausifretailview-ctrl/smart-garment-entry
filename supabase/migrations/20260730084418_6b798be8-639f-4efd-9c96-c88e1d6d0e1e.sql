ALTER TABLE public.product_variants
  ADD COLUMN IF NOT EXISTS barcode_source text NOT NULL DEFAULT 'generated';

CREATE OR REPLACE FUNCTION public.is_valid_gtin_or_imei(p_code text)
RETURNS boolean
LANGUAGE plpgsql
IMMUTABLE
SET search_path = public
AS $$
DECLARE
  c text;
  n int;
  i int;
  d int;
  sum_val int := 0;
  dbl boolean;
BEGIN
  IF p_code IS NULL THEN RETURN false; END IF;
  c := regexp_replace(p_code, '\s', '', 'g');
  IF c !~ '^[0-9]+$' THEN RETURN false; END IF;
  n := length(c);

  IF n IN (8, 12, 13, 14) THEN
    -- GTIN mod-10: weights alternate, rightmost body digit weighted 3
    dbl := true;
    FOR i IN REVERSE (n - 1)..1 LOOP
      d := substr(c, i, 1)::int;
      sum_val := sum_val + (CASE WHEN dbl THEN d * 3 ELSE d END);
      dbl := NOT dbl;
    END LOOP;
    RETURN ((10 - (sum_val % 10)) % 10) = substr(c, n, 1)::int;
  END IF;

  IF n = 15 THEN
    -- Luhn (IMEI)
    dbl := false;
    FOR i IN REVERSE n..1 LOOP
      d := substr(c, i, 1)::int;
      IF dbl THEN
        d := d * 2;
        IF d > 9 THEN d := d - 9; END IF;
      END IF;
      sum_val := sum_val + d;
      dbl := NOT dbl;
    END LOOP;
    RETURN (sum_val % 10) = 0;
  END IF;

  RETURN false;
END;
$$;

UPDATE public.product_variants
SET barcode_source = 'external'
WHERE barcode IS NOT NULL
  AND barcode <> ''
  AND public.is_valid_gtin_or_imei(barcode);