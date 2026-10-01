-- Mix Payment "Finance" tender was folded into sales.card_amount, so bills and reprints could
-- only say "Card". Keep card_amount unchanged (it still includes finance, so every report and
-- tally is unaffected) and record the finance part separately for display.
-- Additive, nullable-safe default; existing rows read 0 and print as before.
ALTER TABLE public.sales
  ADD COLUMN IF NOT EXISTS finance_amount numeric(15,2) NOT NULL DEFAULT 0;

COMMENT ON COLUMN public.sales.finance_amount IS
  'Part of card_amount paid through a financer (Mix Payment Finance). Display only; card_amount already includes it.';
