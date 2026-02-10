

# Fix: LPAD Truncation Causing Duplicate Barcodes for Organizations with Number >= 10

## Root Cause

The `generate_next_barcode` database function uses `LPAD(v_next_barcode::TEXT, 8, '0')` to format the barcode. PostgreSQL's LPAD **truncates** strings longer than the specified length.

For AL NISA (organization_number = 14):
- Starting barcode = 14 x 10,000,000 + 1001 = **140,001,001** (9 digits)
- LPAD to 8 chars truncates the last digit:

```text
140001130 -> '14000113'
140001131 -> '14000113'  (SAME!)
140001132 -> '14000113'  (SAME!)
...
140001140 -> '14000114'
140001141 -> '14000114'  (SAME!)
```

This is why S, M, L all show `14000113` and XL, 2XL both show `14000114` -- they were assigned different sequence numbers but LPAD truncated them to the same 8-character string.

Organizations with number 1-9 have 8-digit barcodes and are unaffected. Only orgs with number >= 10 hit this bug.

## Solution

Update the database function to use a larger LPAD length that accommodates all organization numbers. Changing from `LPAD(..., 8, '0')` to `LPAD(..., 10, '0')` ensures barcodes up to org_number 99 work correctly, while still padding smaller org numbers with leading zeros.

## Technical Details

### Database migration (single change)

Replace the `generate_next_barcode` function, changing both LPAD calls from length 8 to length 10:

```sql
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id UUID)
RETURNS TEXT
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  v_org_number INTEGER;
  v_next_barcode BIGINT;
  v_starting_barcode BIGINT;
  v_max_attempts INTEGER := 1000;
  v_attempt INTEGER := 0;
BEGIN
  SELECT organization_number INTO v_org_number
  FROM public.organizations
  WHERE id = p_organization_id;

  IF v_org_number IS NULL THEN
    RAISE EXCEPTION 'Organization number not set for organization %', p_organization_id;
  END IF;

  v_starting_barcode := (v_org_number * 10000000) + 1001;

  INSERT INTO public.barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, v_starting_barcode + 1)
  ON CONFLICT (organization_id)
  DO UPDATE SET
    next_barcode = barcode_sequence.next_barcode + 1,
    updated_at = now()
  RETURNING next_barcode - 1 INTO v_next_barcode;

  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = LPAD(v_next_barcode::TEXT, 10, '0')
    AND organization_id = p_organization_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequence
    SET next_barcode = next_barcode + 1, updated_at = now()
    WHERE organization_id = p_organization_id
    RETURNING next_barcode - 1 INTO v_next_barcode;
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN LPAD(v_next_barcode::TEXT, 10, '0');
END;
$$;
```

### What changes
- LPAD length: 8 -> 10 (in both the WHILE loop check and the final RETURN)
- Barcodes will now be 10 digits (e.g., `0140001130` for org 14)
- Orgs with number 1-9 get leading zeros (e.g., `0050001001`)
- No frontend changes needed -- the frontend already accepts whatever string the RPC returns

### Impact
- New barcodes will be 10 digits instead of 8
- Existing 8-digit barcodes in the database remain valid and unchanged
- The duplicate detection logic in the frontend (already deployed) will clear old duplicates on next "Auto Generate" click
