-- Industrial mode, Phase 3 step 3b: e-way bills for godown transfers ("For own use").
-- Adds one nullable link column to public.eway_bills: no existing row, table or screen changes.
-- Needs the step 4 SQL (eway_bills) and the step 3a SQL (godown_moves).
-- Rows are still written only by the eway-bill edge function (service role).

ALTER TABLE public.eway_bills
  ADD COLUMN IF NOT EXISTS godown_move_id uuid REFERENCES public.godown_moves(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_eway_bills_godown_move
  ON public.eway_bills (godown_move_id)
  WHERE godown_move_id IS NOT NULL;

COMMENT ON COLUMN public.eway_bills.godown_move_id IS 'Godown transfer (godown_moves) this e-way bill was made for (CHL, own use)';

NOTIFY pgrst, 'reload schema';
