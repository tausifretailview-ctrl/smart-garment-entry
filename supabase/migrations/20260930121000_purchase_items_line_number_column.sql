-- purchase_items.line_number — run ALL statements below in order (Supabase SQL editor).
-- If save fails with: column "line_number" does not exist (42703)

-- Step 1: add column (required for purchase save)
ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS line_number integer NOT NULL DEFAULT 0;

-- Step 2: backfill existing rows (subquery form — no WITH needed)
UPDATE public.purchase_items pi
SET line_number = sub.rn
FROM (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY bill_id
      ORDER BY created_at ASC, id ASC
    )::integer AS rn
  FROM public.purchase_items
  WHERE deleted_at IS NULL
) AS sub
WHERE pi.id = sub.id
  AND pi.line_number = 0;

-- Step 3: index
CREATE INDEX IF NOT EXISTS idx_purchase_items_bill_line_number
  ON public.purchase_items (bill_id, line_number)
  WHERE deleted_at IS NULL;

-- Step 4: optional comment
COMMENT ON COLUMN public.purchase_items.line_number IS
  '1-based entry order on the purchase bill screen; stable across reload/print.';
