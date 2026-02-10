

# Fix: Duplicate Barcode Generation in AL NISA Organization

## Problem

When auto-generating barcodes for new products in the AL NISA organization, the system generates barcode numbers that already exist in other products (e.g., barcode `14000101` already assigned to product "LEHGA"). This causes a "Duplicate Barcode Error" when trying to save.

## Root Cause

The `generate_next_barcode` database function simply increments a counter in the `barcode_sequence` table. It never verifies whether the generated barcode already exists in the `product_variants` table. If the sequence gets out of sync (e.g., due to manual barcode entry, data imports, or formula changes during migrations), it can produce barcodes that conflict with existing records.

Additionally, for AL NISA (organization_number = 14), the current formula produces 9-digit barcodes (starting at 140,001,001), but existing barcodes are 8-digit (14,000,101 range), indicating a previous formula was used. The sequence needs to account for all existing barcodes regardless of how they were generated.

## Solution

Two changes are needed:

### 1. Fix the database function to skip existing barcodes

Update `generate_next_barcode` to check if the generated barcode already exists in `product_variants` and keep incrementing until a unique one is found. This makes it collision-proof regardless of how barcodes were originally created.

### 2. Fix the AL NISA sequence to start past existing barcodes

Run a one-time data fix to advance the AL NISA sequence counter past all existing barcodes, preventing future collisions.

## Technical Details

### Database Migration

Update the `generate_next_barcode` function:

```sql
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id uuid)
RETURNS text
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
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

  -- Get and increment the sequence
  INSERT INTO public.barcode_sequence (organization_id, next_barcode)
  VALUES (p_organization_id, v_starting_barcode + 1)
  ON CONFLICT (organization_id)
  DO UPDATE SET
    next_barcode = barcode_sequence.next_barcode + 1,
    updated_at = now()
  RETURNING next_barcode - 1 INTO v_next_barcode;

  -- Check if this barcode already exists, keep incrementing if so
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = LPAD(v_next_barcode::TEXT, 8, '0')
    AND organization_id = p_organization_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequence
    SET next_barcode = next_barcode + 1, updated_at = now()
    WHERE organization_id = p_organization_id
    RETURNING next_barcode - 1 INTO v_next_barcode;
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN LPAD(v_next_barcode::TEXT, 8, '0');
END;
$$;
```

Also include a data fix to sync the AL NISA sequence:

```sql
-- Advance AL NISA sequence past all existing barcodes
UPDATE barcode_sequence
SET next_barcode = GREATEST(
  next_barcode,
  (SELECT COALESCE(MAX(barcode::bigint), 0) + 1
   FROM product_variants
   WHERE organization_id = '70e4d691-2604-4ae9-9127-27f8e9535585'
   AND barcode ~ '^\d+$')
)
WHERE organization_id = '70e4d691-2604-4ae9-9127-27f8e9535585';
```

### Also fix the duplicate barcode `14000101`

Clean up the existing duplicate so the user can proceed:

```sql
-- Remove the duplicate barcode from the newer record (product "DM")
UPDATE product_variants
SET barcode = NULL
WHERE organization_id = '70e4d691-2604-4ae9-9127-27f8e9535585'
AND barcode = '14000101'
AND product_id = (SELECT id FROM products WHERE product_name = 'DM'
  AND organization_id = '70e4d691-2604-4ae9-9127-27f8e9535585' LIMIT 1);
```

### No frontend code changes needed

The fix is entirely in the database function. The existing sequential generation code in `ProductEntry.tsx` and `ProductEntryDialog.tsx` will work correctly once the RPC returns unique barcodes.

## Expected Result

- Auto-generated barcodes will always be unique, even if the sequence was previously out of sync
- The existing duplicate barcode conflict for AL NISA is resolved
- All other organizations are also protected from future barcode collisions

