-- purchase_items.line_number was added in 20260823120200 but may be missing if that
-- migration was not deployed before 20260930120800 (save RPC references line_number).
-- Error seen: column "line_number" of relation "purchase_items" does not exist (42703).

ALTER TABLE public.purchase_items
  ADD COLUMN IF NOT EXISTS line_number integer NOT NULL DEFAULT 0;

WITH numbered AS (
  SELECT
    pi.id,
    ROW_NUMBER() OVER (
      PARTITION BY pi.bill_id
      ORDER BY pi.created_at ASC, pi.id ASC
    )::integer AS rn
  FROM public.purchase_items pi
  WHERE pi.deleted_at IS NULL
)
UPDATE public.purchase_items pi
SET line_number = numbered.rn
FROM numbered
WHERE pi.id = numbered.id
  AND pi.line_number = 0;

CREATE INDEX IF NOT EXISTS idx_purchase_items_bill_line_number
  ON public.purchase_items (bill_id, line_number)
  WHERE deleted_at IS NULL;

COMMENT ON COLUMN public.purchase_items.line_number IS
  '1-based entry order on the purchase bill screen; stable across reload/print.';
