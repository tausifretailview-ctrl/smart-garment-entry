

## Plan: Org-Scoped Barcode Prefixes

### Context
The current system already has per-org sequences (the `barcode_sequence` table has `organization_id`), but barcodes are purely numeric with org_number-based ranges (e.g., org 1 → `0010001001`, org 9 → `0090001001`). The user wants to replace this with **text-prefix-based barcodes** (e.g., `EZZ0000001`) using a new `barcode_sequences` table.

### Step 1: Database Migration

Create migration with:

```sql
-- 1. New per-org sequence table with text prefix
CREATE TABLE IF NOT EXISTS public.barcode_sequences (
  organization_id UUID NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  prefix          TEXT NOT NULL,
  next_number     BIGINT NOT NULL DEFAULT 1,
  updated_at      TIMESTAMPTZ DEFAULT now(),
  PRIMARY KEY (organization_id)
);

ALTER TABLE public.barcode_sequences ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Org members can view barcode sequences"
  ON public.barcode_sequences FOR SELECT TO authenticated
  USING (organization_id IN (SELECT public.get_user_organization_ids(auth.uid())));

-- 2. Seed from existing orgs using UPPER(LEFT(slug, 3)) as prefix
INSERT INTO public.barcode_sequences (organization_id, prefix, next_number)
SELECT o.id, UPPER(LEFT(o.slug, 3)), COALESCE(bs.next_barcode - (o.organization_number * 10000000) - 1000, 1)
FROM public.organizations o
LEFT JOIN public.barcode_sequence bs ON bs.organization_id = o.id
ON CONFLICT DO NOTHING;

-- 3. Replace the generator function (same name + signature, no front-end changes)
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_org_id UUID)
RETURNS TEXT LANGUAGE plpgsql SECURITY DEFINER SET search_path = public
AS $$
DECLARE
  v_prefix TEXT;
  v_num    BIGINT;
  v_barcode TEXT;
  v_max_attempts INTEGER := 1000;
  v_attempt INTEGER := 0;
BEGIN
  UPDATE barcode_sequences
  SET next_number = next_number + 1, updated_at = now()
  WHERE organization_id = p_org_id
  RETURNING prefix, next_number - 1 INTO v_prefix, v_num;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'No barcode sequence for org %', p_org_id;
  END IF;

  v_barcode := v_prefix || LPAD(v_num::TEXT, 7, '0');

  -- Skip collisions with existing barcodes
  WHILE EXISTS (
    SELECT 1 FROM product_variants
    WHERE barcode = v_barcode AND organization_id = p_org_id
  ) AND v_attempt < v_max_attempts LOOP
    UPDATE barcode_sequences
    SET next_number = next_number + 1, updated_at = now()
    WHERE organization_id = p_org_id
    RETURNING next_number - 1 INTO v_num;
    v_barcode := v_prefix || LPAD(v_num::TEXT, 7, '0');
    v_attempt := v_attempt + 1;
  END LOOP;

  RETURN v_barcode;
END; $$;

-- Keep backward compat: the old p_organization_id parameter name
CREATE OR REPLACE FUNCTION public.generate_next_barcode(p_organization_id UUID)
RETURNS TEXT LANGUAGE sql SECURITY DEFINER SET search_path = public
AS $$ SELECT public.generate_next_barcode(p_organization_id); $$;

GRANT EXECUTE ON FUNCTION public.generate_next_barcode(UUID) TO authenticated;
```

**Note:** The existing `barcode_sequence` table is left intact (no drop) to avoid breaking anything during rollout. It simply becomes unused.

### Step 2: Update Reset-Organization Edge Function

In `supabase/functions/reset-organization/index.ts`, update the sequence reset (lines 162-172) to target `barcode_sequences` instead of `barcode_sequence`, resetting `next_number` to `1` instead of a numeric start value.

### Step 3: Update useOrganizationReset Hook

In `src/hooks/useOrganizationReset.tsx`, the `getBarcodeStartValue()` function currently returns numeric values like `90001001`. Update to pass `1` as the reset value since the prefix is now stored in the table.

### What Does NOT Change
- **Front-end RPC calls** — all call `supabase.rpc('generate_next_barcode', { p_organization_id })` and receive a string back. No changes needed in `ProductEntry`, `PurchaseEntry`, or `ProductEntryDialog`.
- **Barcode validation** — `checkBarcodeExists` works on string comparison, unaffected.
- **Existing barcodes** — old numeric barcodes remain valid in the database; new ones will use the prefix format going forward.

### Files Changed
1. **New migration SQL** — create `barcode_sequences` table, seed data, replace function
2. **`supabase/functions/reset-organization/index.ts`** — update table name + column
3. **`src/hooks/useOrganizationReset.tsx`** — simplify barcode start value logic

